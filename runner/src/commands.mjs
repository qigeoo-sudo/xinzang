/**
 * 指令分派：心跳响应中的 commands 在此串行执行。
 * 安全约束：
 * - 所有文件操作限定在 contentRoot 之内（isInsideContentRoot），越权即失败
 * - 默认只产出元数据（路径/哈希/字节数/时间），不回传文件正文
 * - 唯一受控开口：read_view_docs（S8 AI 比对）——仅允许两类白名单阅览文档
 *   （语言人格风格分析 / 第一轮审核清单），须哈希核验、限大小，正文只供控制平面评分
 * - codex_deliver 在 M5 验证前恒定返回 needs_validation（Q15）
 */
import path from 'node:path';
import { readFile, readdir, rename, stat } from 'node:fs/promises';
import {
  hashFile,
  isInsideContentRoot,
  listMentorDirs,
  listMentorFiles,
  listWorkFiles,
  scanWorkPackages,
  toDisplayPath,
} from './filer.mjs';
import { detectCodex, deliverTrigger } from './codex.mjs';
import {
  feishuChatMessages,
  feishuDownloadResource,
  feishuSendFile,
  feishuSendText,
  feishuWhoami,
} from './feishu.mjs';

/**
 * S5 Claude 产物规范命名（docs/mentor-content-operations-v1.md Q17/归档约定）：
 * 确保文件基名含 ` by sonnet` 标记；已含（大小写不敏感）则跳过，否则就地重命名。
 * 只改文件名不碰内容，SHA-256 不受影响。
 * @returns {Promise<string>} 重命名后的绝对路径
 */
async function applyBySonnetRename(abs) {
  const dir = path.dirname(abs);
  const ext = path.extname(abs);
  const base = path.basename(abs, ext);
  if (/by\s*sonnet/i.test(base)) return abs;
  const finalAbs = path.join(dir, `${base} by sonnet${ext}`);
  await rename(abs, finalAbs);
  return finalAbs;
}

/**
 * S5 Claude 产物扫描（Q17 归档约定）：扫描导师根目录（非递归）下的文档文件，
 * 逐个套用 ` by sonnet` 规范命名（幂等）后作为候选返回——先改名、再显示，
 * 用户看到并确认的即为规范命名后的文件；只改名不改内容。
 * @returns {Promise<Array<{relPath: string, originalRelPath: string, bytes: number, mtimeMs: number, renamed: boolean, suggestedKind: string}>>}
 */
async function prepareClaudeOutputs(contentRoot, mentorDir) {
  const mentorRoot = path.join(contentRoot, 'mentors', mentorDir);
  if (!isInsideContentRoot(mentorRoot, contentRoot)) {
    throw new Error(`导师目录越界: ${mentorDir}`);
  }
  const DOC_EXTS = new Set(['.md', '.txt', '.docx', '.doc']);
  const out = [];
  let entries;
  try {
    entries = await readdir(mentorRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    if (out.length >= 50) break;
    if (!entry.isFile()) continue;
    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    if (!DOC_EXTS.has(ext)) continue;
    const abs = path.join(mentorRoot, entry.name);
    let finalAbs = abs;
    let renamed = false;
    try {
      finalAbs = await applyBySonnetRename(abs);
      renamed = finalAbs !== abs;
    } catch {
      // 改名失败（如目标重名）仍按原名列出，交由人工处理
    }
    let s;
    try {
      s = await stat(finalAbs);
    } catch {
      continue;
    }
    const relPath = toDisplayPath(finalAbs, contentRoot);
    if (!relPath) continue;
    out.push({
      relPath,
      originalRelPath: toDisplayPath(abs, contentRoot),
      bytes: s.size,
      mtimeMs: s.mtimeMs,
      renamed,
      suggestedKind: 'claude_output',
    });
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

export async function handleCommand(command, contentRoot) {
  const { type, payload = {} } = command;
  switch (type) {
    case 'ping':
      return { pong: true, at: new Date().toISOString() };

    case 'list_mentor_dirs':
      return { dirs: await listMentorDirs(contentRoot) };

    case 'scan_work_packages': {
      if (!payload.mentorDir || typeof payload.mentorDir !== 'string') {
        throw new Error('scan_work_packages 缺少 mentorDir');
      }
      return { mentorDir: payload.mentorDir, packages: await scanWorkPackages(contentRoot, payload.mentorDir) };
    }

    case 'list_mentor_files': {
      if (!payload.mentorDir || typeof payload.mentorDir !== 'string') {
        throw new Error('list_mentor_files 缺少 mentorDir');
      }
      return { mentorDir: payload.mentorDir, files: await listMentorFiles(contentRoot, payload.mentorDir) };
    }

    case 'list_work_files': {
      if (!payload.mentorDir || typeof payload.mentorDir !== 'string') {
        throw new Error('list_work_files 缺少 mentorDir');
      }
      return { mentorDir: payload.mentorDir, files: await listWorkFiles(contentRoot, payload.mentorDir) };
    }

    case 'prepare_claude_outputs': {
      if (!payload.mentorDir || typeof payload.mentorDir !== 'string') {
        throw new Error('prepare_claude_outputs 缺少 mentorDir');
      }
      return { mentorDir: payload.mentorDir, files: await prepareClaudeOutputs(contentRoot, payload.mentorDir) };
    }

    case 'hash_files': {
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (items.length === 0 || items.length > 100) {
        throw new Error('hash_files items 数量非法（1-100）');
      }
      const results = [];
      for (const item of items) {
        const p = typeof item === 'string' ? item : String(item?.path ?? '');
        const normalize = typeof item === 'object' && item !== null ? item.normalize : undefined;
        if (typeof p !== 'string' || p.length === 0) {
          results.push({ path: String(p), ok: false, reason: 'bad_path' });
          continue;
        }
        const abs = path.resolve(p); // 接收绝对路径；相对路径按 cwd 解析（拒绝）
        if (!path.isAbsolute(p) || !isInsideContentRoot(abs, contentRoot)) {
          results.push({ path: p, ok: false, reason: 'outside_content_root' });
          continue;
        }
        try {
          let finalAbs = abs;
          let renamed = false;
          if (normalize === 'by_sonnet') {
            finalAbs = await applyBySonnetRename(abs);
            renamed = finalAbs !== abs;
          }
          const { sha256, bytes } = await hashFile(finalAbs);
          results.push({
            path: p, // 原始请求路径（引擎用它与登记清单匹配）
            finalPath: finalAbs, // 规范命名后的绝对路径（未重命名时同 path）
            displayPath: toDisplayPath(finalAbs, contentRoot),
            renamed,
            sha256,
            bytes,
            ok: true,
          });
        } catch (err) {
          results.push({ path: p, ok: false, reason: err.code || 'hash_failed' });
        }
      }
      return { results };
    }

    case 'codex_probe':
      return { codex: await detectCodex() };

    case 'codex_deliver':
      return deliverTrigger();

    case 'feishu_probe':
      return { feishu: await feishuWhoami() };

    case 'feishu_list_messages': {
      // 元数据级拉群消息（S10 审核回复识别用）；文本正文不回传
      const chatId = payload.chatId;
      return {
        chatId: String(chatId),
        ...(await feishuChatMessages({ chatId, limit: payload.limit, order: payload.order })),
      };
    }

    case 'feishu_download_resource': {
      // 下载消息资源落盘到导师目录；destDirAbs 必须在 CONTENT_ROOT 内
      const destDirAbs = path.resolve(String(payload.destDirAbs || ''));
      if (!path.isAbsolute(destDirAbs) || !isInsideContentRoot(destDirAbs, contentRoot)) {
        throw new Error(`feishu_download_resource 目标目录越界: ${payload.destDirAbs}`);
      }
      return {
        chatId: payload.chatId ? String(payload.chatId) : undefined,
        ...(await feishuDownloadResource(payload)),
      };
    }

    case 'feishu_send_message': {
      // 发送（人工批准后由引擎入队才执行）：kind=file（先核验哈希再上传）/ kind=text（G1 固定文案）
      const chatId = payload.chatId;
      if (payload.kind === 'file') {
        const fileName = String(payload.fileName || '');
        if (path.basename(fileName) !== fileName) {
          throw new Error(`feishu_send_message 文件名非法: ${fileName}`);
        }
        const srcDirAbs = path.resolve(String(payload.srcDirAbs || ''));
        if (!path.isAbsolute(srcDirAbs) || !isInsideContentRoot(srcDirAbs, contentRoot)) {
          throw new Error(`feishu_send_message 源目录越界: ${payload.srcDirAbs}`);
        }
        // 发送前核验内容哈希与批准登记一致（防 D 盘文件在批准后被改动）
        const { sha256 } = await hashFile(path.join(srcDirAbs, fileName));
        if (payload.expectedSha && sha256 !== payload.expectedSha) {
          throw new Error(`文件内容与批准时不一致（sha256 不匹配），已拒绝发送：${fileName}`);
        }
        const r = await feishuSendFile({
          chatId,
          srcDirAbs,
          fileName,
          idempotencyKey: payload.idempotencyKey,
          dryRun: payload.dryRun,
        });
        // 失败时带出 lark-cli 原始输出尾部（1500 字符，含完整 message/hint/log_id），便于在面板直接看到飞书服务器的报错原话
        if (!r.ok) throw new Error(`飞书发送文件失败: ${r.reason}${r.raw ? `｜raw: ${r.raw.slice(-1500)}` : ''}`);
        return { kind: 'file', fileName, ...r };
      }
      const r = await feishuSendText({
        chatId,
        text: payload.text,
        idempotencyKey: payload.idempotencyKey,
        dryRun: payload.dryRun,
      });
      if (!r.ok) throw new Error(`飞书发送文案失败: ${r.reason}${r.raw ? `｜raw: ${r.raw.slice(-1500)}` : ''}`);
      return { kind: 'text', ...r };
    }

    case 'locate_view_docs': {
      // S8：定位第一轮阅览文件（本导师 work 目录）+ 同类参考文档，附带哈希
      return locateViewDocs(contentRoot, payload.mentorDir);
    }

    case 'read_view_docs': {
      // S8 唯一正文开口：读取 locate 登记过的阅览文档正文，供控制平面 AI 评分
      return readViewDocs(contentRoot, payload.items);
    }

    default:
      throw new Error(`未知指令类型: ${type}`);
  }
}

// ------------------------------------------------------------------
// S8：第一轮阅览文件定位 + 受控正文读取（P2a）
// ------------------------------------------------------------------

/** 阅览文件命名约定（D:\database\AGENTS.md L153-154）：<Display_Name>_语言人格风格分析 / 第一轮审核清单 _v<版本>.md */
const VIEW_DOC_PATTERNS = [
  { docType: 'style_analysis', re: /语言人格风格分析/ },
  { docType: 'review_checklist', re: /第一轮审核清单/ },
];

/** 旧版基线、回复源、前置材料与内部构建目录一律不作候选 */
const EXCLUDED_DIR_SEGMENTS = new Set([
  'baseline',
  'review-source',
  'prerequisites',
  'prompt-system',
  'audio-analysis',
  'deployment-baseline',
  'node_modules',
]);

/** 回复稿、风格「更新」稿、第二轮文件不是第一轮阅览文件 */
const EXCLUDED_NAME_RE = /回复|更新|第二轮/;

/** read_view_docs 正文开口大小上限（200KB，两类文档实测均 <20KB） */
const VIEW_DOC_MAX_BYTES = 200 * 1024;

function parseDocVersion(base) {
  const m = base.match(/_v(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : [];
}

function cmpVersion(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** 递归收集 .md 文件（深度≤3、总数≤60，跳过基线/内部目录） */
async function walkMdFiles(rootDir, depth, out) {
  if (out.length >= 60 || depth > 3) return;
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= 60) return;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_SEGMENTS.has(entry.name)) continue;
      await walkMdFiles(path.join(rootDir, entry.name), depth + 1, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(path.join(rootDir, entry.name));
    }
  }
}

/**
 * 每位导师每个 docType 只取版本最高者；同版本并列多份全部保留，
 * 交由控制平面判 ambiguous（不能按 mtime 盲选，AGENTS.md L94 同类原则）。
 */
function pickLatestByType(items) {
  const byType = new Map();
  for (const it of items) {
    const arr = byType.get(it.docType) ?? [];
    arr.push(it);
    byType.set(it.docType, arr);
  }
  const out = [];
  for (const arr of byType.values()) {
    let bestRank = [];
    for (const it of arr) {
      const r = parseDocVersion(it.relPath);
      if (cmpVersion(r, bestRank) > 0) bestRank = r;
    }
    out.push(...arr.filter((it) => cmpVersion(parseDocVersion(it.relPath), bestRank) === 0));
  }
  return out;
}

async function scanViewDocs(scanDir, contentRoot) {
  const files = [];
  await walkMdFiles(scanDir, 0, files);
  const out = [];
  for (const abs of files) {
    const base = path.basename(abs);
    if (EXCLUDED_NAME_RE.test(base)) continue;
    const hit = VIEW_DOC_PATTERNS.find((p) => p.re.test(base));
    if (!hit) continue;
    try {
      const { sha256, bytes } = await hashFile(abs);
      const m = base.match(/_v(\d+(?:\.\d+)*)/);
      out.push({
        relPath: toDisplayPath(abs, contentRoot),
        absPath: abs,
        docType: hit.docType,
        version: m ? `v${m[1]}` : null,
        bytes,
        sha256,
      });
    } catch {
      /* 单文件哈希失败跳过 */
    }
  }
  return out;
}

/**
 * 定位第一轮阅览文件 + 同类参考文档，全部附 SHA-256。
 * 参考集（D:\database\AGENTS.md L587 + 2026-10-07 人工校对定型，每类每人取最新版）：
 *   kevin yuan / phyllis chi / ying wang，各取「语言人格风格分析」「第一轮审核清单」
 *   版本最高一份；旧「完整音频语言风格分析」「语言风格三层表」已并入 phyllis v0.3，不再作参考。
 */
export async function locateViewDocs(contentRoot, mentorDir) {
  const dir = String(mentorDir || '');
  const mentorRoot = path.join(contentRoot, 'mentors', dir);
  if (!isInsideContentRoot(mentorRoot, contentRoot)) throw new Error(`导师目录越界: ${dir}`);

  const own = await scanViewDocs(path.join(mentorRoot, 'work'), contentRoot);
  const docs = pickLatestByType(own);

  const refMentors = ['kevin yuan', 'phyllis chi', 'ying wang'].filter(
    (d) => d.toLowerCase() !== dir.toLowerCase(),
  );
  const refs = [];
  for (const ref of refMentors) {
    const found = await scanViewDocs(path.join(contentRoot, 'mentors', ref, 'work'), contentRoot);
    refs.push(...pickLatestByType(found).map((f) => ({ ...f, refMentor: ref })));
  }
  return { mentorDir: dir, docs, refs };
}

/**
 * S8 唯一正文开口：读取 locate 阶段登记过的阅览文档正文回传控制平面。
 * 白名单：文件名必须命中两类正式文档、不含 回复/更新/第二轮、限 .md/.txt、限 200KB；
 * 回传前重算 SHA-256 与登记值一致，防止批准后文件被换。
 */
export async function readViewDocs(contentRoot, rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0 || items.length > 12) throw new Error('read_view_docs items 数量非法（1-12）');
  const results = [];
  for (const item of items) {
    const abs = path.resolve(String(item?.absPath || ''));
    if (!path.isAbsolute(String(item?.absPath || '')) || !isInsideContentRoot(abs, contentRoot)) {
      throw new Error(`read_view_docs 路径越界: ${item?.absPath}`);
    }
    const base = path.basename(abs);
    if (!/语言人格风格分析|第一轮审核清单/.test(base) || EXCLUDED_NAME_RE.test(base)) {
      throw new Error(`read_view_docs 非白名单文件: ${base}`);
    }
    if (!/\.(md|txt)$/i.test(base)) throw new Error(`read_view_docs 仅允许 md/txt: ${base}`);
    const s = await stat(abs);
    if (s.size > VIEW_DOC_MAX_BYTES) throw new Error(`read_view_docs 文件超 200KB 上限: ${base}`);
    const { sha256 } = await hashFile(abs);
    if (item.sha256 && sha256 !== item.sha256) {
      throw new Error(`read_view_docs 哈希与登记不一致，拒绝读取: ${base}`);
    }
    const content = await readFile(abs, 'utf8');
    results.push({
      absPath: abs,
      relPath: toDisplayPath(abs, contentRoot),
      docType: String(item.docType || ''),
      refMentor: item.refMentor ? String(item.refMentor) : undefined,
      sha256,
      bytes: s.size,
      content,
    });
  }
  return { results };
}
