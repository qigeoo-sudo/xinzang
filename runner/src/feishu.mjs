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
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashFile } from './filer.mjs';

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
function runLark(cli, args, { timeoutMs = 30_000, cwd, asBot = true } = {}) {
  // 统一以机器人身份调用（appId + appSecret 自动刷新令牌，不再依赖 2h 过期的 UAT）
  const finalArgs = asBot ? ['--as', 'bot', ...args] : args;
  return new Promise((resolve) => {
    execFile(
      cli,
      finalArgs,
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
    const r = await runLark(cli, ['--version'], { timeoutMs: 10_000, asBot: false });
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

/**
 * 群里"非导师"操作员 open_id（按用户与飞书后台确认的规则）：
 * 每个榨职机群成员固定为：导师 + 陈初效 + 陆秉文 + 机器人。
 * 排除后剩下的唯一 user open_id 即为该群导师。
 */
const EXCLUDED_OPERATOR_OPEN_IDS = new Set([
  'ou_44e070298544e1650e1681773941d526', // 陈初效（lydiachen）
  'ou_d984d6a0a7591b505c11c41901f71a1c', // 陆秉文
]);

// —— 妙记（Minutes）API ——
// 直连 fetch + tenant_access_token（index.mjs refreshLarkTenantToken 每 100 分钟刷新注入）。
// 注意：标题在 INFO 端点（data.minute.title），media 端点不返回文档标题；
// transcript 端点返回 text/plain 纯文本（2026-10-09 实测），不是 JSON。
// minute_token 固定 24 字符（ob + 22 位字母数字），从消息 content 里的妙记 URL 提取。
const MINUTES_API_BASE = 'https://open.feishu.cn/open-apis/minutes/v1/minutes';
const MINUTE_TOKEN_PATTERN = /^ob[A-Za-z0-9]{22}$/;

/** 妙记 GET 通用封装（tenant 身份直连）：返回解析后的 body；非 2xx/业务错误返回 ok:false */
async function minutesFetch(minuteToken, subPath) {
  const token = process.env.LARKSUITE_CLI_TENANT_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: 'no_tenant_token', raw: '环境变量 LARKSUITE_CLI_TENANT_ACCESS_TOKEN 未设置' };
  if (!minuteToken || !MINUTE_TOKEN_PATTERN.test(minuteToken)) {
    return { ok: false, reason: 'bad_minute_token' };
  }
  let res;
  try {
    res = await fetch(`${MINUTES_API_BASE}/${minuteToken}${subPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return { ok: false, reason: 'fetch_error', raw: String(e?.message || e).slice(0, 500) };
  }
  const ct = res.headers.get('content-type') || '';
  const bodyText = await res.text();
  if (!res.ok) {
    return { ok: false, reason: `http_${res.status}`, raw: bodyText.slice(0, 500) };
  }
  if (ct.includes('json')) {
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return { ok: false, reason: 'bad_json', raw: `HTTP ${res.status}` };
    }
    if (data.code !== 0) {
      return { ok: false, reason: `api_error_${data.code}`, raw: JSON.stringify(data).slice(0, 500) };
    }
    return { ok: true, data, text: bodyText };
  }
  // text/plain 等非 JSON 响应（transcript 端点）原样返回文本
  return { ok: true, data: null, text: bodyText };
}

/**
 * 获取妙记文档信息（标题）。
 * GET /open-apis/minutes/v1/minutes/:minute_token → data.minute.title
 */
export async function feishuMinutesInfo({ minuteToken }) {
  const r = await minutesFetch(minuteToken, '');
  if (!r.ok) return r;
  return { ok: true, title: r.data?.data?.minute?.title ?? r.data?.data?.minutes?.title ?? null };
}

/**
 * 获取妙记音频下载信息。
 * GET /open-apis/minutes/v1/minutes/:minute_token/media → data.download_url（免鉴权临时链接）
 */
export async function feishuMinutesMediaInfo({ minuteToken }) {
  const r = await minutesFetch(minuteToken, '/media');
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  const media = r.data?.data?.media ?? r.data?.data;
  const downloadUrl = media?.download_url ?? media?.url;
  if (!downloadUrl) {
    return { ok: false, reason: 'no_download_url', raw: JSON.stringify(r.data).slice(0, 500) };
  }
  return { ok: true, downloadUrl };
}

/**
 * 导出妙记文字稿（纯文本：首行日期+时长，随后关键词与说话人分段）。
 * GET /open-apis/minutes/v1/minutes/:minute_token/transcript?need_speaker=true&need_timestamp=true
 */
export async function feishuMinutesTranscriptExport({ minuteToken }) {
  const r = await minutesFetch(minuteToken, '/transcript?need_speaker=true&need_timestamp=true');
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  const content = (r.text || '').trim();
  if (!content) {
    return { ok: false, reason: 'no_transcript', raw: 'transcript 端点返回空内容' };
  }
  return { ok: true, content };
}

/** 从消息 content 提取妙记 minute_token（去重） */
export function extractMinuteTokens(content) {
  if (typeof content !== 'string' || !content) return [];
  const tokens = [];
  const re = /\/minutes\/(ob[A-Za-z0-9]{22})/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    tokens.push(m[1]);
  }
  return [...new Set(tokens)];
}

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
  // 语音消息（S13 第二轮访谈若以语音条发送）：飞书 content 形如 <audio key="file_xxx" duration="…"/>，
  // 语音没有文件名，合成占位名由引擎按消息识别；资源下载仍走 type=file
  if (m.msg_type === 'audio' && typeof m.content === 'string') {
    const am = m.content.match(/<audio\s+[^>]*(?:key|file_key)="(file_[^"]+)"/);
    if (am) {
      msg.fileKey = am[1];
      msg.fileName = null;
    }
  }
  // 妙记 URL 提取：扫描所有消息 content 里的 /minutes/obXXX 链接
  // （妙记可能以 text/post/interactive 形式分享，不限 msg_type）
  const minuteTokens = extractMinuteTokens(typeof m.content === 'string' ? m.content : '');
  if (minuteTokens.length > 0) {
    msg.minuteTokens = minuteTokens;
  }
  return msg;
}

/**
 * 拉取群消息（元数据级）。limit 1-500（lark-cli 单次 50 条 × 最多 10 页自动翻页）。
 * order asc = 按会话时间正序（从群第一条开始），desc = 最新在前。
 * expandMinutes=true 时扫描所有消息 content 里的妙记 URL，调 API 获取标题，
 * 为每个 minute_token 生成两条虚拟文件（音频 .m4a + 文字稿 .txt）加入 messages。
 */
export async function feishuChatMessages({ chatId, limit = 500, order = 'asc', expandMinutes = false } = {}) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  const { cli } = await resolveLarkCli();
  const capped = Math.max(1, Math.min(500, Number(limit) || 500));
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
  const rawMessages = Array.isArray(r.json?.data?.messages) ? r.json.data.messages : [];
  const messages = rawMessages.map(normalizeMessage);

  // 妙记拆解：扫描所有消息 content，为每个导师发出的 minute_token 生成两条虚拟文件
  if (expandMinutes) {
    const tokenToSrcMsg = new Map();
    for (const raw of rawMessages) {
      const tokens = extractMinuteTokens(typeof raw.content === 'string' ? raw.content : '');
      for (const token of tokens) {
        if (!tokenToSrcMsg.has(token)) tokenToSrcMsg.set(token, raw);
      }
    }
    for (const [token, rawMsg] of tokenToSrcMsg) {
      const senderId = rawMsg?.sender?.id;
      const senderType = rawMsg?.sender?.sender_type;
      // 排除操作员和机器人发出的妙记
      if (senderType === 'app' || senderType === 'bot') continue;
      if (senderId && EXCLUDED_OPERATOR_OPEN_IDS.has(senderId)) continue;

      // 调 info API 获取文档标题（media 端点不返回标题，2026-10-09 实测）
      const info = await feishuMinutesInfo({ minuteToken: token });
      const title = info.ok ? (info.title || '妙记') : '妙记';
      const base = normalizeMessage(rawMsg);
      // 音频虚拟文件
      messages.push({
        ...base,
        msgType: 'file',
        fileKey: null,
        minuteToken: token,
        fileName: `${title}.m4a`,
        isMinutesVirtual: true,
      });
      // 文字稿虚拟文件
      messages.push({
        ...base,
        msgType: 'file',
        fileKey: null,
        minuteToken: token,
        fileName: `${title}.txt`,
        isMinutesVirtual: true,
      });
    }
  }

  return { ok: true, count: messages.length, hasMore: Boolean(r.json?.data?.has_more), messages };
}

/**
 * 群成员元数据（users/bots 分桶，只回传显示名，不回传完整 id），供机器人进群软提示。
 * 响应形状异常时按失败处理，避免把「读不懂」误报成「机器人不在群」。
 */
export async function feishuChatInfo({ chatId }) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  const { cli } = await resolveLarkCli();
  const args = [
    'im',
    '+chat-members-list',
    '--chat-id',
    chatId,
    '--member-id-type',
    'open_id',
    '--page-all',
    '--format',
    'json',
  ];
  const r = await runLark(cli, args, { timeoutMs: LIST_TIMEOUT_MS });
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  if (r.json && r.json.ok === false) {
    return { ok: false, reason: r.json.error?.message || 'members_list_failed', raw: r.raw };
  }
  const d = r.json?.data ?? {};
  if (!Array.isArray(d.users) && !Array.isArray(d.bots) && !Array.isArray(d.members)) {
    return { ok: false, reason: 'unexpected_response_shape', raw: r.raw };
  }
  const toNames = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((x) => ({
        name: typeof x?.name === 'string' && x.name ? x.name : typeof x?.member_id === 'string' ? x.member_id.slice(0, 12) : null,
        memberType: typeof x?.member_type === 'string' ? x.member_type : null,
      }))
      .slice(0, 100);
  return {
    ok: true,
    users: toNames(d.users ?? d.members),
    bots: toNames(d.bots),
    truncated: Array.isArray(d.truncations) ? d.truncations.length > 0 : false,
  };
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
    // 幂等重试：文件已落盘（上次回报可能被拒），直接复用，由调用方哈希校验
    return { ok: true, destAbs, bytes: existing.size, reused: true };
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

/**
 * 按群名搜索飞书群，返回匹配的 chat_id。
 *
 * 直连 open-apis/im/v1/chats 列出机器人已加入的全部群，本地按群名匹配。
 * 绕过 lark-cli 的 strict-mode=user 策略（外部凭据模式下 `--as bot` 命令被拦截）。
 * 机器人身份的 tenant_access_token 已由 index.mjs 的 refreshLarkTenantToken 注入到
 * LARKSUITE_CLI_TENANT_ACCESS_TOKEN 环境变量，直接读取使用即可。
 *
 * 多个匹配时优先返回精确匹配，否则返回第一个包含关键字的；无匹配返回 no_match。
 */
export async function feishuSearchChatId({ query }) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, reason: 'empty_query' };
  const token = process.env.LARKSUITE_CLI_TENANT_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: 'no_tenant_token', raw: '环境变量 LARKSUITE_CLI_TENANT_ACCESS_TOKEN 未设置' };
  let items = [];
  let pageToken = '';
  for (let i = 0; i < 5; i++) { // 最多翻 5 页（500 群）
    const url = new URL('https://open.feishu.cn/open-apis/im/v1/chats');
    url.searchParams.set('page_size', '100');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      return { ok: false, reason: 'fetch_error', raw: String(e?.message || e).slice(0, 500) };
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      return { ok: false, reason: 'bad_json', raw: `HTTP ${res.status}: ${String(e?.message || e).slice(0, 300)}` };
    }
    if (data.code !== 0) {
      return { ok: false, reason: `api_error_${data.code}`, raw: JSON.stringify(data).slice(0, 500) };
    }
    items = items.concat(Array.isArray(data.data?.items) ? data.data.items : []);
    if (!data.data?.has_more || !data.data?.page_token) break;
    pageToken = data.data.page_token;
  }
  if (items.length === 0) {
    return { ok: false, reason: 'no_chats', raw: '机器人未加入任何群，请先把自建应用机器人邀请进群' };
  }
  const exact = items.find((c) => c.name === q);
  const partial = items.find((c) => (c.name || '').includes(q));
  const hit = exact ?? partial;
  if (!hit) {
    const sample = items.slice(0, 5).map((c) => c.name).join('、');
    return {
      ok: false,
      reason: 'no_match',
      raw: `机器人在 ${items.length} 个群里未找到名称含 "${q}" 的群（已加入的群名样本：${sample}…）`,
    };
  }
  if (!hit.chat_id) return { ok: false, reason: 'no_chat_id', raw: JSON.stringify(hit).slice(0, 500) };
  return { ok: true, chatId: hit.chat_id, chatName: hit.name ?? q };
}

const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.wav', '.aac', '.amr', '.ogg', '.flac', '.opus', '.wma', '.aiff', '.aif']);
const TEXT_EXTS = new Set(['.md', '.txt', '.docx', '.doc', '.pdf']);
const ILLEGAL_CHARS_RE = /[\\/:*?"<>|]/g;

function sanitizeFsName(name) {
  return name.replace(ILLEGAL_CHARS_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xFEE0));
}

/** 排除操作员（陈初效、陆秉文）和机器人发送者 */
function isExcludedSender(msg) {
  if (msg.senderType === 'app' || msg.senderType === 'bot') return true;
  if (msg.senderId && EXCLUDED_OPERATOR_OPEN_IDS.has(msg.senderId)) return true;
  return false;
}

/**
 * 下载妙记音频或文字稿到指定目录。
 * kind='audio' → 调 media API 获取临时下载链接 → fetch 落盘
 * kind='transcript' → 调 transcript API 获取文字稿 → 写文件
 */
export async function feishuDownloadMinutes({ minuteToken, kind, destDirAbs, destName }) {
  if (!MINUTE_TOKEN_PATTERN.test(String(minuteToken || ''))) return { ok: false, reason: 'bad_minute_token' };
  const name = String(destName || '').trim();
  if (!name || name.startsWith('.') || UNSAFE_NAME_RE.test(name)) return { ok: false, reason: 'bad_dest_name' };
  const dir = String(destDirAbs || '');
  if (!path.isAbsolute(dir)) return { ok: false, reason: 'bad_dest_dir' };
  const destAbs = path.join(dir, name);

  // 幂等：文件已存在且非空，直接复用
  let existing = null;
  try { existing = await stat(destAbs); } catch { /* 首次下载 */ }
  if (existing && existing.isFile() && existing.size > 0) {
    return { ok: true, destAbs, bytes: existing.size, reused: true };
  }

  if (kind === 'audio') {
    const media = await feishuMinutesMediaInfo({ minuteToken });
    if (!media.ok) return media;
    let res;
    try {
      res = await fetch(media.downloadUrl);
    } catch (e) {
      return { ok: false, reason: 'fetch_error', raw: String(e?.message || e).slice(0, 500) };
    }
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, raw: `下载妙记音频失败: HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dir, { recursive: true });
    await writeFile(destAbs, buf);
    return { ok: true, destAbs, bytes: buf.length };
  }
  // kind === 'transcript'
  const t = await feishuMinutesTranscriptExport({ minuteToken });
  if (!t.ok) return t;
  await mkdir(dir, { recursive: true });
  await writeFile(destAbs, t.content, 'utf-8');
  return { ok: true, destAbs, bytes: Buffer.byteLength(t.content, 'utf-8') };
}

/**
 * S1 一体化扫描下载：全量拉取飞书群消息 → 导师过滤 → 妙记拆解 →
 * S1 关键词规则过滤 → 下载匹配文件 → 返回候选清单。
 *
 * S1 关键词规则（2026-10-09 用户定）：
 * - 含"审核清单" → 弃（回复类文件，归 S10/S16）
 * - 含"第二轮" → 弃（另一轮）
 * - 含"第一轮" → 抓（下载）
 * - 其余音频/文字 → "不明"候选（仅元数据，待人工审核）
 *
 * 目录结构（D:\database\AGENTS.md §4）：
 *   mentors/<mentorDir>/<mentorDir> word/<mentorDir> 第一轮 interview word/
 *   mentors/<mentorDir>/<mentorDir> audio/<mentorDir> 第一轮 interview audio/
 * 顶层目录 <mentorDir> 必须已存在（人工创建），Runner 只建子目录。
 * 返回格式：{ ok, files: [{ relPath, bytes, mtimeMs, suggestedKind }], unknownCandidates: [...] }
 */
/** S1 第一轮归档目录约定（与 feishuScanAndDownload 共用）：音频/文字两个落盘目录 */
async function firstRoundDirs({ mentorDir, contentRoot }) {
  const mentorRoot = path.join(contentRoot, 'mentors', mentorDir);
  const topStat = await stat(mentorRoot).catch(() => null);
  if (!topStat || !topStat.isDirectory()) {
    return { ok: false, reason: 'mentor_top_dir_missing', mentorRoot };
  }
  const wordDir = path.join(mentorRoot, `${mentorDir} word`, `${mentorDir} 第一轮 interview word`);
  const audioDir = path.join(mentorRoot, `${mentorDir} audio`, `${mentorDir} 第一轮 interview audio`);
  await mkdir(wordDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });
  return { ok: true, mentorRoot, wordDir, audioDir };
}

export async function feishuScanAndDownload({ chatId, mentorDir, contentRoot }) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  if (!mentorDir || typeof mentorDir !== 'string') return { ok: false, reason: 'bad_mentor_dir' };

  // 1. 全量拉取群消息（从第一条开始，asc，含妙记拆解）
  const msgResult = await feishuChatMessages({ chatId, limit: 500, order: 'asc', expandMinutes: true });
  if (!msgResult.ok) return { ok: false, reason: msgResult.reason, raw: msgResult.raw };

  // 2. 筛选：导师发出的文件（排除操作员+机器人），排除已删除
  const mentorFiles = msgResult.messages.filter(
    (m) => (m.msgType === 'file' || m.msgType === 'audio') && !m.deleted && !isExcludedSender(m),
  );

  // 3. 建目录结构（顶层目录必须已存在）
  const dirs = await firstRoundDirs({ mentorDir, contentRoot });
  if (!dirs.ok) return { ok: false, reason: dirs.reason, mentorRoot: dirs.mentorRoot };
  const wordDir = dirs.wordDir;
  const audioDir = dirs.audioDir;

  // 4. S1 关键词规则过滤 + 下载
  const files = [];
  const unknownCandidates = [];
  for (const msg of mentorFiles) {
    let fileName = msg.fileName;
    if (!fileName) {
      const ext = msg.msgType === 'audio' ? '.m4a' : '';
      fileName = `audio_${msg.messageId.slice(-12)}${ext}`;
    }
    const safeName = sanitizeFsName(fileName);
    const ext = path.extname(safeName).toLowerCase();
    const isAudio = AUDIO_EXTS.has(ext);
    const isText = TEXT_EXTS.has(ext);
    if (!isAudio && !isText) continue; // 跳过非音频/非文本文件

    // S1 关键词规则
    if (fileName.includes('审核清单')) continue; // 弃
    if (fileName.includes('第二轮')) continue;   // 弃
    if (!fileName.includes('第一轮')) {
      // "不明"候选（未下载，仅元数据，待人工审核）
      unknownCandidates.push({
        messageId: msg.messageId,
        fileKey: msg.fileKey,
        minuteToken: msg.minuteToken || null,
        fileName: safeName,
        senderName: msg.senderName,
        createTime: msg.createTime,
        kind: isAudio ? 'audio' : 'transcript',
      });
      continue;
    }
    // 含"第一轮" → 抓（下载）
    const destDir = isAudio ? audioDir : wordDir;
    const destAbs = path.join(destDir, safeName);
    let dlOk = false;
    if (msg.minuteToken) {
      const dl = await feishuDownloadMinutes({
        minuteToken: msg.minuteToken,
        kind: isAudio ? 'audio' : 'transcript',
        destDirAbs: destDir,
        destName: safeName,
      });
      dlOk = dl.ok;
    } else if (msg.fileKey) {
      const dl = await feishuDownloadResource({
        messageId: msg.messageId,
        fileKey: msg.fileKey,
        type: 'file',
        destDirAbs: destDir,
        destName: safeName,
      });
      dlOk = dl.ok;
    }
    if (!dlOk) continue;
    const s = await stat(destAbs).catch(() => null);
    if (!s) continue;
    const relPath = path.relative(contentRoot, destAbs).split(path.sep).join('/');
    files.push({
      relPath,
      bytes: s.size,
      mtimeMs: s.mtimeMs,
      suggestedKind: isAudio ? 'source_audio' : 'source_transcript',
    });
  }

  return { ok: true, files, unknownCandidates, count: files.length };
}

/**
 * S1 不明候选批量下载：按人工勾选清单逐条下载（普通文件走消息资源，妙记走妙记 API），
 * 落盘到第一轮归档目录并立即计算 SHA-256。单条失败不中断整批，失败清单随结果回传。
 * 返回格式：{ ok, results: [{ messageId, kind, fileName, destName, destAbs, relPath, bytes, sha256 }], failed: [{ fileName, reason }] }
 */
export async function feishuDownloadUnknownBatch({ mentorDir, contentRoot, items }) {
  if (!mentorDir || typeof mentorDir !== 'string') return { ok: false, reason: 'bad_mentor_dir' };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: 'empty_items' };

  const dirs = await firstRoundDirs({ mentorDir, contentRoot });
  if (!dirs.ok) return { ok: false, reason: dirs.reason, mentorRoot: dirs.mentorRoot };

  const results = [];
  const failed = [];
  for (const item of items) {
    const kind = item.kind === 'audio' ? 'audio' : 'transcript';
    const fileName = String(item.fileName || `unknown_${String(item.messageId || '').slice(-12)}`);
    const safeName = sanitizeFsName(fileName);
    const destDir = kind === 'audio' ? dirs.audioDir : dirs.wordDir;
    try {
      let dl;
      if (item.minuteToken) {
        dl = await feishuDownloadMinutes({
          minuteToken: String(item.minuteToken),
          kind,
          destDirAbs: destDir,
          destName: safeName,
        });
      } else if (item.fileKey) {
        dl = await feishuDownloadResource({
          messageId: String(item.messageId || ''),
          fileKey: String(item.fileKey),
          type: 'file',
          destDirAbs: destDir,
          destName: safeName,
        });
      } else {
        dl = { ok: false, reason: 'no_file_identity' };
      }
      if (!dl.ok) {
        failed.push({ fileName, reason: dl.reason || 'download_failed' });
        continue;
      }
      const s = await stat(dl.destAbs);
      const relPath = path.relative(contentRoot, dl.destAbs).split(path.sep).join('/');
      const { sha256 } = await hashFile(dl.destAbs);
      results.push({
        messageId: item.messageId ?? null,
        kind,
        fileName,
        destName: safeName,
        destAbs: dl.destAbs,
        relPath,
        bytes: s.size,
        sha256,
      });
    } catch (err) {
      failed.push({ fileName, reason: err?.message?.slice(0, 300) || 'download_failed' });
    }
  }
  return { ok: true, results, failed };
}

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

/**
 * 定位群里导师的 open_id（排除法：每个群只有 导师+陈初效+陆秉文+机器人）。
 * 调 +chat-members-list 拿完整 member_id，排除 EXCLUDED_OPERATOR_OPEN_IDS 与所有 bot 的 member_id，
 * 剩下的唯一 user 即导师。不唯一时返回失败，交由控制平面回退人工。
 */
export async function feishuResolveMentorOpenId({ chatId }) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  const { cli } = await resolveLarkCli();
  const args = [
    'im',
    '+chat-members-list',
    '--chat-id',
    chatId,
    '--member-id-type',
    'open_id',
    '--page-all',
    '--format',
    'json',
  ];
  const r = await runLark(cli, args, { timeoutMs: LIST_TIMEOUT_MS });
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  if (r.json && r.json.ok === false) {
    return { ok: false, reason: r.json.error?.message || 'members_list_failed', raw: r.raw };
  }
  const d = r.json?.data ?? {};
  const users = Array.isArray(d.users) ? d.users : Array.isArray(d.members) ? d.members : [];
  const bots = Array.isArray(d.bots) ? d.bots : [];
  const botIds = new Set(bots.map((b) => String(b?.member_id || b?.open_id || '').trim()).filter(Boolean));
  const remaining = users
    .map((u) => String(u?.member_id || u?.open_id || '').trim())
    .filter((id) => id && !EXCLUDED_OPERATOR_OPEN_IDS.has(id) && !botIds.has(id));
  if (remaining.length === 1) {
    return { ok: true, mentorOpenId: remaining[0] };
  }
  if (remaining.length === 0) {
    return { ok: false, reason: 'mentor_not_found', count: 0, raw: r.raw.slice(0, 500) };
  }
  return { ok: false, reason: 'mentor_not_unique', count: remaining.length, raw: r.raw.slice(0, 500) };
}

/**
 * 回复某条消息 + post 富文本 @mention（G1 文案：@导师 + 回复审核清单文件消息）。
 * 用 +messages-reply --message-id <om_xxx> --msg-type post --content <JSON>，
 * 导师收到飞书通知 + 点击引用即可找到审核清单文件。
 * 结构与 feishuSendPostMention 一致：[{at: open_id + user_name}, {text: bodyText}]。
 */
export async function feishuReplyPostMention({ chatId, replyToMessageId, mentorName, bodyText, idempotencyKey, dryRun = false }) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  if (!MESSAGE_ID_RE.test(String(replyToMessageId || ''))) return { ok: false, reason: 'bad_reply_to_message_id' };
  const name = String(mentorName || '').trim();
  if (!name) return { ok: false, reason: 'empty_mentor_name' };
  const body = String(bodyText ?? '');
  if (!body) return { ok: false, reason: 'empty_body' };

  const resolved = await feishuResolveMentorOpenId({ chatId });
  if (!resolved.ok) {
    return { ok: false, reason: `mentor_resolve:${resolved.reason}`, raw: resolved.raw ?? '' };
  }

  const post = JSON.stringify({
    zh_cn: {
      title: '',
      content: [[{ tag: 'at', user_id: resolved.mentorOpenId, user_name: name }, { tag: 'text', text: body }]],
    },
  });

  const { cli } = await resolveLarkCli();
  const args = [
    'im',
    '+messages-reply',
    '--message-id',
    replyToMessageId,
    '--msg-type',
    'post',
    '--content',
    post,
    '--idempotency-key',
    sanitizeIdempotencyKey(idempotencyKey),
    '--format',
    'json',
  ];
  if (dryRun) args.push('--dry-run');
  const r = await runLark(cli, args, { timeoutMs: SEND_TIMEOUT_MS });
  if (!r.ok) return { ok: false, reason: r.reason, raw: r.raw };
  if (r.json && r.json.ok === false) {
    return { ok: false, reason: r.json.error?.message || 'reply_failed', raw: r.raw };
  }
  return { ok: true, messageId: r.json?.data?.message_id ?? null, dryRun, raw: r.raw.slice(0, 500) };
}

/**
 * 发送 post 富文本 @mention 消息（G3 文案）。
 * 结构：[{at: 导师 open_id + user_name}, {text: bodyText}]。
 * 导师 open_id 由 feishuResolveMentorOpenId 排除法定位，user_name 由控制平面按导师中文名传入。
 * 用 execFile 数组传参（content 字段是 JSON 字符串），避免 shell 引号吞引号。
 */
export async function feishuSendPostMention({ chatId, mentorName, bodyText, idempotencyKey, dryRun = false }) {
  if (!CHAT_ID_RE.test(String(chatId || ''))) return { ok: false, reason: 'bad_chat_id' };
  const name = String(mentorName || '').trim();
  if (!name) return { ok: false, reason: 'empty_mentor_name' };
  const body = String(bodyText ?? '');
  if (!body) return { ok: false, reason: 'empty_body' };

  const resolved = await feishuResolveMentorOpenId({ chatId });
  if (!resolved.ok) {
    return { ok: false, reason: `mentor_resolve:${resolved.reason}`, raw: resolved.raw ?? '' };
  }

  const post = JSON.stringify({
    zh_cn: {
      title: '',
      content: [[{ tag: 'at', user_id: resolved.mentorOpenId, user_name: name }, { tag: 'text', text: body }]],
    },
  });

  const { cli } = await resolveLarkCli();
  const args = [
    'im',
    '+messages-send',
    '--chat-id',
    chatId,
    '--msg-type',
    'post',
    '--content',
    post,
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
