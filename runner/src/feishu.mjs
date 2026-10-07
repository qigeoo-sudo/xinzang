/**
 * 飞书连接器（P2a，方案 A：Runner 包装 lark-cli）
 * docs/mentor-content-operations-v1.md §3 连接器矩阵：群消息拉取/文件下载/发送均 needs_validation，
 * 任何一步失败都以 {ok:false, reason, raw} 返回，由控制平面回退人工，不臆测成功。
 *
 * 安全边界：
 * - 参数一律 execFile 数组传递（不开 shell，无注入面）；id/chat 等入参再做格式校验
 * - 下载/发送涉及落盘的目录由 commands.mjs 先校验在 CONTENT_ROOT 之内
 * - 消息只取元数据（时间/类型/文件名/发送者/序号），文本正文不回传——观察窗仅元数据（L400）
 * - 发送指令只能由控制平面在人工批准后入队；幂等键透传 lark-cli --idempotency-key 防重发
 * - lark-cli 自发现：环境变量 LARK_CLI_PATH → Trae 插件目录最新版 → PATH 兜底，不写死版本号
 */
import { execFile } from 'node:child_process';
import { readdir, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LIST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const SEND_TIMEOUT_MS = 120_000;
const WHOAMI_TIMEOUT_MS = 15_000;

let cachedCli = null;

/** 扫描 Trae 插件目录下所有版本的 lark-cli.exe，取修改时间最新者 */
async function pluginCandidates() {
  const base = path.join(os.homedir(), '.trae-cn', 'plugins', 'trae-remote-official', 'lark');
  let versions;
  try {
    versions = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const hits = [];
  for (const v of versions) {
    if (!v.isDirectory()) continue;
    const exe = path.join(base, v.name, 'bin', 'lark-cli.exe');
    try {
      const s = await stat(exe);
      if (s.isFile()) hits.push({ exe, mtimeMs: s.mtimeMs });
    } catch {
      /* 该版本目录无 lark-cli.exe，跳过 */
    }
  }
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return hits.map((h) => h.exe);
}

/** 执行单条 lark-cli 命令并解析输出；exit 0 即 ok，JSON 宽松解析失败时原样透传 raw */
function runLark(cli, args, { timeoutMs = 30_000, cwd } = {}) {
  return new Promise((resolve) => {
    execFile(
      cli,
      args,
      { timeout: timeoutMs, cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const raw = String(stdout || '');
        const errRaw = String(stderr || '');
        if (err) {
          resolve({
            ok: false,
            reason: err.killed ? 'timeout' : `exit_${err.code ?? 'unknown'}`,
            error: err.message,
            raw: `${raw}\n${errRaw}`.trim().slice(0, 4000),
          });
          return;
        }
        const trimmed = raw.trim();
        let json = null;
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            json = JSON.parse(trimmed);
          } catch {
            /* 非 JSON 输出，保持 null */
          }
        }
        resolve({ ok: true, json, raw: trimmed.slice(0, 4000) });
      },
    );
  });
}

/** 找到可用 lark-cli 并缓存（进程生命周期内发现一次） */
export async function resolveLarkCli() {
  if (cachedCli) return cachedCli;
  const candidates = [process.env.LARK_CLI_PATH, ...(await pluginCandidates()), 'lark-cli'].filter(Boolean);
  for (const cli of candidates) {
    const r = await runLark(cli, ['--version'], { timeoutMs: 10_000 });
    if (r.ok) {
      cachedCli = { cli, version: r.json?.version ?? r.raw ?? null };
      return cachedCli;
    }
  }
  throw new Error('未找到可用的 lark-cli（可设环境变量 LARK_CLI_PATH 指定路径）');
}

const CHAT_ID_RE = /^oc_[A-Za-z0-9]+$/;
const MESSAGE_ID_RE = /^om_[A-Za-z0-9]+$/;
const FILE_KEY_RE = /^(img|file)_[A-Za-z0-9_-]+$/;
// 目标文件名白名单：单段路径（无目录分隔符/盘符/通配符/..），首字符不为点
const UNSAFE_NAME_RE = /[\\/:*?"<>|]|\.\./;

/** 群消息 → 元数据级归一化；文件消息额外解析 key/文件名，文本正文一律不回传 */
function normalizeMessage(m) {
  const msg = {
    messageId: m.message_id,
    msgType: m.msg_type,
    createTime: m.create_time ?? null,
    position: Number(m.message_position ?? 0) || 0,
    senderName: m.sender?.name || m.sender?.sender_i18n_names?.zh_cn || m.sender?.id || null,
    senderId: m.sender?.id || null,
    senderType: m.sender?.sender_type || null,
    deleted: Boolean(m.deleted),
  };
  if (m.msg_type === 'file' && typeof m.content === 'string') {
    const fm = m.content.match(/<file\s+key="([^"]+)"\s+name="([^"]*)"\s*\/?>/);
    if (fm) {
      msg.fileKey = fm[1];
      msg.fileName = fm[2];
    }
  }
  return msg;
}

/**
 * 拉取群消息（元数据级）。limit 1-500（lark-cli 单次 50 条 × 最多 10 页自动翻页）。
 * order asc = 按会话时间正序（找「某序号之后的新消息」用），desc = 最新在前。
 */
export async function feishuChatMessages({ chatId, limit = 200, order = 'asc' } = {}) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  const { cli } = await resolveLarkCli();
  const capped = Math.max(1, Math.min(500, Number(limit) || 200));
  const args = [
    'im',
    '+chat-messages-list',
    '--chat-id',
    chatId,
    '--order',
    order === 'desc' ? 'desc' : 'asc',
    '--page-all',
    '--page-size',
    '50',
    '--page-limit',
    String(Math.max(1, Math.ceil(capped / 50))),
    '--no-reactions',
    '--format',
    'json',
  ];
  const r = await runLark(cli, args, { timeoutMs: LIST_TIMEOUT_MS });
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  if (r.json && r.json.ok === false) {
    return { ok: false, reason: r.json.error?.message || 'list_failed', raw: r.raw };
  }
  const messages = Array.isArray(r.json?.data?.messages) ? r.json.data.messages.map(normalizeMessage) : [];
  return { ok: true, count: messages.length, hasMore: Boolean(r.json?.data?.has_more), messages };
}

/**
 * 下载消息内资源到指定目录（destDirAbs 必须已由调用方校验在 CONTENT_ROOT 内）。
 * lark-cli --output 拒绝绝对路径与 ..，因此 spawn cwd=destDirAbs、--output 只传文件名。
 * 目标同名非空文件已存在时拒绝（D 盘只增不改纪律），0 字节残留先清理再重试。
 */
export async function feishuDownloadResource({ messageId, fileKey, type = 'file', destDirAbs, destName }) {
  if (!MESSAGE_ID_RE.test(String(messageId || ''))) return { ok: false, reason: 'bad_message_id' };
  if (!FILE_KEY_RE.test(String(fileKey || ''))) return { ok: false, reason: 'bad_file_key' };
  const name = String(destName || '').trim();
  if (!name || name.startsWith('.') || UNSAFE_NAME_RE.test(name)) return { ok: false, reason: 'bad_dest_name' };
  const dir = String(destDirAbs || '');
  if (!path.isAbsolute(dir)) return { ok: false, reason: 'bad_dest_dir' };

  const { cli } = await resolveLarkCli();
  const destAbs = path.join(dir, name);
  let existing = null;
  try {
    existing = await stat(destAbs);
  } catch {
    /* 目标不存在，正常首次下载 */
  }
  if (existing && existing.isFile() && existing.size > 0) {
    return { ok: false, reason: 'dest_exists', destAbs };
  }
  if (existing) {
    try {
      await unlink(destAbs);
    } catch {
      /* 0 字节残留清理失败，交给 lark-cli 处理 */
    }
  }

  const args = [
    'im',
    '+messages-resources-download',
    '--message-id',
    messageId,
    '--file-key',
    fileKey,
    '--type',
    type === 'image' ? 'image' : 'file',
    '--output',
    name,
    '--format',
    'json',
  ];
  const r = await runLark(cli, args, { timeoutMs: DOWNLOAD_TIMEOUT_MS, cwd: dir });
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  if (r.json && r.json.ok === false) {
    return { ok: false, reason: r.json.error?.message || 'download_failed', raw: r.raw };
  }
  let s;
  try {
    s = await stat(destAbs);
  } catch {
    return { ok: false, reason: 'not_saved', raw: r.raw };
  }
  return { ok: true, destAbs, bytes: s.size };
}

function sanitizeIdempotencyKey(key) {
  const cleaned = String(key || '')
    .slice(0, 50)
    .replace(/[^A-Za-z0-9:_-]/g, '');
  return cleaned || `runner-${Date.now()}`;
}

/** 发送纯文本消息（固定文案，文案由引擎/文档模板固定，Runner 不拼接自由文本） */
export async function feishuSendText({ chatId, text, idempotencyKey, dryRun = false }) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  const body = String(text ?? '');
  if (!body.trim()) return { ok: false, reason: 'empty_text' };
  const { cli } = await resolveLarkCli();
  const args = [
    'im',
    '+messages-send',
    '--chat-id',
    chatId,
    '--text',
    body,
    '--idempotency-key',
    sanitizeIdempotencyKey(idempotencyKey),
    '--format',
    'json',
  ];
  if (dryRun) args.push('--dry-run');
  const r = await runLark(cli, args, { timeoutMs: SEND_TIMEOUT_MS });
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  if (r.json && r.json.ok === false) {
    return { ok: false, reason: r.json.error?.message || 'send_failed', raw: r.raw };
  }
  return { ok: true, messageId: r.json?.data?.message_id ?? null, dryRun, raw: r.raw.slice(0, 500) };
}

/**
 * 发送本地文件到群。lark-cli 拒绝绝对路径与 ..：spawn cwd=srcDirAbs、--file 只传文件名，
 * 因此 srcDirAbs 必须已由调用方校验在 CONTENT_ROOT 内。
 */
export async function feishuSendFile({ chatId, srcDirAbs, fileName, idempotencyKey, dryRun = false }) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  const name = String(fileName || '').trim();
  if (!name || name.startsWith('.') || UNSAFE_NAME_RE.test(name)) return { ok: false, reason: 'bad_file_name' };
  const dir = String(srcDirAbs || '');
  if (!path.isAbsolute(dir)) return { ok: false, reason: 'bad_src_dir' };

  const { cli } = await resolveLarkCli();
  const srcAbs = path.join(dir, name);
  try {
    const s = await stat(srcAbs);
    if (!s.isFile()) return { ok: false, reason: 'src_not_found' };
  } catch {
    return { ok: false, reason: 'src_not_found' };
  }

  const args = [
    'im',
    '+messages-send',
    '--chat-id',
    chatId,
    '--file',
    name,
    '--idempotency-key',
    sanitizeIdempotencyKey(idempotencyKey),
    '--format',
    'json',
  ];
  if (dryRun) args.push('--dry-run');
  const r = await runLark(cli, args, { timeoutMs: SEND_TIMEOUT_MS, cwd: dir });
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  if (r.json && r.json.ok === false) {
    return { ok: false, reason: r.json.error?.message || 'send_failed', raw: r.raw };
  }
  return { ok: true, messageId: r.json?.data?.message_id ?? null, dryRun, raw: r.raw.slice(0, 500) };
}

/** 探测登录态与 CLI 版本（whoami）：供面板显示「lark-cli 已登录/未登录」，不臆测 */
export async function feishuWhoami() {
  let cliInfo;
  try {
    cliInfo = await resolveLarkCli();
  } catch (err) {
    return { installed: false, reason: err instanceof Error ? err.message : 'cli_not_found' };
  }
  const r = await runLark(cliInfo.cli, ['whoami'], { timeoutMs: WHOAMI_TIMEOUT_MS });
  if (!r.ok) return { installed: true, version: cliInfo.version ?? null, loggedIn: false, reason: r.reason, raw: r.raw };
  const j = r.json;
  return {
    installed: true,
    version: cliInfo.version ?? null,
    // 登录态以 tokenStatus=ready 且 available=true 为准，不做字符串臆测
    loggedIn: j?.available === true && j?.tokenStatus === 'ready',
    identity: j?.identity ?? null,
    name: j?.onBehalfOf?.userName ?? null,
  };
}
