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
import { mkdir, readFile, readdir, rename, stat } from 'node:fs/promises';
import {
  hashFile,
  isInsideContentRoot,
  listMentorDirs,
  listMentorFiles,
  listWorkFiles,
  scanFinalHandoff,
  scanWorkPackages,
  toDisplayPath,
} from './filer.mjs';
import { detectCodex, deliverTrigger } from './codex.mjs';
import {
  gitFetchStatus,
  gitBackupCreate,
  gitIntegrateHandoff,
  runRegressionTests,
  gitPushMain,
  deployStaging,
  activateMentorStaging,
  gitPromoteMainToMaster,
  deployProduction,
  verifyProduction,
} from './git.mjs';
import {
  feishuChatInfo,
  feishuChatMessages,
  feishuDownloadResource,
  feishuSendFile,
  feishuSendPostMention,
  feishuSendText,
  feishuWhoami,
} from './feishu.mjs';

/**
 * 从目标路径反推导师顶层目录（<contentRoot>/mentors/<mentorDir>）。
 * 顶层目录必须由人工预先创建，Runner 只允许在其下创建子目录。
 * @returns {string|null} 顶层目录绝对路径；若路径不在 mentors 下则返回 null
 */
function mentorTopDir(destDirAbs, contentRoot) {
  const rel = path.relative(contentRoot, destDirAbs).split(path.sep);
  if (rel[0] !== 'mentors' || !rel[1]) return null;
  return path.join(contentRoot, 'mentors', rel[1]);
}

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

    case 'codex_deliver': {
      // S6/S11/S14/S16：向 Codex 投递固定触发语；workspaceDir 必须在 CONTENT_ROOT 内
      const workspaceDir = path.resolve(String(payload.workspaceDir || ''));
      if (!path.isAbsolute(workspaceDir) || !isInsideContentRoot(workspaceDir, contentRoot)) {
        throw new Error(`codex_deliver 工作目录越界: ${payload.workspaceDir}`);
      }
      return deliverTrigger({
        workspaceDir,
        trigger: String(payload.trigger || ''),
        threadId: payload.threadId ? String(payload.threadId) : undefined,
      });
    }

    case 'feishu_probe':
      return { feishu: await feishuWhoami() };

    case 'feishu_list_messages': {
      // 元数据级拉群消息（S10 审核回复识别用）；文本正文不回传
      const chatId = payload.chatId;
      const r = await feishuChatMessages({ chatId, limit: payload.limit, order: payload.order });
      if (!r.ok) throw new Error(`拉取群消息失败: ${r.reason}${r.raw ? `｜raw: ${r.raw.slice(-1000)}` : ''}`);
      return { chatId: String(chatId), ok: true, count: r.count, hasMore: r.hasMore, messages: r.messages };
    }

    case 'feishu_download_resource': {
      // 下载消息资源落盘到导师目录；destDirAbs 必须在 CONTENT_ROOT 内。
      // 顶层导师目录必须由人工预先创建；Runner 只允许在其下创建子目录（S13 第二轮 audio/word 等）。
      const destDirAbs = path.resolve(String(payload.destDirAbs || ''));
      if (!path.isAbsolute(destDirAbs) || !isInsideContentRoot(destDirAbs, contentRoot)) {
        throw new Error(`feishu_download_resource 目标目录越界: ${payload.destDirAbs}`);
      }
      const topDir = mentorTopDir(destDirAbs, contentRoot);
      if (!topDir) throw new Error(`feishu_download_resource 目标不在 mentors 目录下: ${payload.destDirAbs}`);
      const topStat = await stat(topDir).catch(() => null);
      if (!topStat || !topStat.isDirectory()) {
        throw new Error(`导师顶层目录不存在，请先由人工创建后再下载: ${topDir}`);
      }
      await mkdir(destDirAbs, { recursive: true });
      const r = await feishuDownloadResource(payload);
      if (!r.ok) throw new Error(`下载回复文件失败: ${r.reason}${r.raw ? `｜raw: ${r.raw.slice(-1000)}` : ''}`);
      // 规范（AGENTS §10.3）要求保留字节数与 SHA-256，落盘后立即计算
      const { sha256 } = await hashFile(r.destAbs);
      return {
        destAbs: r.destAbs,
        destName: payload.destName ? String(payload.destName) : path.basename(r.destAbs),
        bytes: r.bytes,
        sha256,
      };
    }

    case 'feishu_chat_info': {
      // 群成员元数据（users/bots 分桶），供 S0 机器人进群软提示；只回传显示名，不回传完整 id
      const r = await feishuChatInfo({ chatId: payload.chatId });
      if (!r.ok) throw new Error(`群信息探测失败: ${r.reason}${r.raw ? `｜raw: ${r.raw.slice(-800)}` : ''}`);
      return { chatId: String(payload.chatId), ...r };
    }

    case 'scan_final_handoff': {
      // S17：定位导师 work 目录下最新 -final-handoff-v<actual> 包 + 四件套 + 哈希基线
      if (!payload.mentorDir || typeof payload.mentorDir !== 'string') {
        throw new Error('scan_final_handoff 缺少 mentorDir');
      }
      const r = await scanFinalHandoff(contentRoot, payload.mentorDir);
      if (!r) {
        return { packagePath: null, version: null, coreFiles: [], missing: ['00_START_HERE.md', 'source_manifest_final.json', 'TRAE_HANDOFF.md', 'VALIDATION_REPORT.md'] };
      }
      return r;
    }

    case 'preflight_checks': {
      // S18：读 Final Handoff 包内文件，回传原始内容供控制平面解析（preflight-checks.ts runAllChecks）
      if (!payload.mentorDir || typeof payload.mentorDir !== 'string') {
        throw new Error('preflight_checks 缺少 mentorDir');
      }
      const r = await scanFinalHandoff(contentRoot, payload.mentorDir);
      if (!r) throw new Error('Final Handoff 包未定位到，无法预检');
      const pkgAbs = path.join(contentRoot, r.packagePath);
      const readText = async (name) => {
        try {
          return await readFile(path.join(pkgAbs, name), 'utf8');
        } catch {
          return null;
        }
      };
      const manifestText = await readText('source_manifest_final.json');
      const traeHandoffText = await readText('TRAE_HANDOFF.md');
      const validationText = await readText('VALIDATION_REPORT.md');
      let manifest = null;
      try { manifest = manifestText ? JSON.parse(manifestText) : null; } catch { manifest = null; }
      // 知识卡 JSONL：扫包内所有 .jsonl 文件逐行解析
      const knowledgeCards = [];
      async function walkJsonl(dir) {
        let ents;
        try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const ent of ents) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            // 跳过基线子目录（baseline/、deployment-baseline/），里面的旧版 JSONL 不是当前版本
            if (ent.name === 'baseline' || ent.name === 'deployment-baseline') continue;
            await walkJsonl(full);
            continue;
          }
          if (!ent.name.toLowerCase().endsWith('.jsonl')) continue;
          const text = await readFile(full, 'utf8').catch(() => '');
          for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj && typeof obj === 'object') knowledgeCards.push(obj);
            } catch { /* skip bad line */ }
          }
        }
      }
      await walkJsonl(pkgAbs);
      // Prompt System 快照：从 prompt-system 目录结构组装（manifest.json + persona.md + capability.json + boundary）
      let promptSystemSnapshot = null;
      {
        const psFiles = r.coreFiles.filter((f) => f.relPath && f.relPath.toLowerCase().includes('prompt-system') && f.exists);
        const findFile = (keyword) => psFiles.find((f) => f.relPath.toLowerCase().includes(keyword));
        const readJson = async (f) => {
          if (!f) return null;
          try { return JSON.parse(await readFile(path.join(contentRoot, f.relPath), 'utf8')); } catch { return null; }
        };
        const readText = async (f) => {
          if (!f) return null;
          try { return await readFile(path.join(contentRoot, f.relPath), 'utf8'); } catch { return null; }
        };
        const manifest = await readJson(findFile('manifest.json'));
        const personaText = await readText(findFile('persona'));
        const capabilityJson = await readJson(findFile('capability.json'));
        const boundaryText = await readText(findFile('boundary'));
        const evalsText = await readText(findFile('evals'));
        if (manifest || personaText || capabilityJson) {
          promptSystemSnapshot = {
            persona: personaText ? personaText.trim().split('\n')[0].replace(/^#\s*/, '') : (manifest?.publicName ?? manifest?.id ?? null),
            capabilities: Array.isArray(capabilityJson?.capabilities) ? capabilityJson.capabilities
              : Array.isArray(manifest?.allowedTools) ? manifest.allowedTools
              : [],
            boundaries: Array.isArray(capabilityJson?.boundaries) ? capabilityJson.boundaries
              : (boundaryText ? [boundaryText.trim().split('\n')[0].replace(/^#\s*/, '')] : []),
            evals: evalsText ? [evalsText.trim().split('\n')[0]] : [],
            manifestStatus: manifest?.status ? 'pass' : 'unknown',
          };
        }
      }
      return {
        packagePath: r.packagePath,
        version: r.version,
        coreFiles: r.coreFiles,
        missing: r.missing,
        manifestText: manifestText ? manifestText.slice(0, 20000) : null, // 限长回传
        traeHandoffText: traeHandoffText ? traeHandoffText.slice(0, 20000) : null,
        validationText: validationText ? validationText.slice(0, 20000) : null,
        knowledgeCards: knowledgeCards.slice(0, 500), // 限 500 张
        promptSystemSnapshot,
      };
    }

    case 'resolve_pending_card': {
      // S19：列出 pending 卡（只读，不修改）；复用 preflight_checks 的 JSONL 解析
      if (!payload.mentorDir || typeof payload.mentorDir !== 'string') {
        throw new Error('resolve_pending_card 缺少 mentorDir');
      }
      const r = await scanFinalHandoff(contentRoot, payload.mentorDir);
      if (!r) return { pendingCards: [] };
      const pkgAbs = path.join(contentRoot, r.packagePath);
      const pendingCards = [];
      async function walkJsonl(dir) {
        let ents;
        try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const ent of ents) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (ent.name === 'baseline' || ent.name === 'deployment-baseline') continue;
            await walkJsonl(full);
            continue;
          }
          if (!ent.name.toLowerCase().endsWith('.jsonl')) continue;
          const text = await readFile(full, 'utf8').catch(() => '');
          for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj && typeof obj === 'object' && String(obj.knowledgeClass || '').endsWith('_pending')) {
                pendingCards.push({
                  cardId: String(obj.cardId ?? ''),
                  knowledgeClass: String(obj.knowledgeClass ?? ''),
                  disclosureMode: String(obj.disclosureMode ?? ''),
                  round: Number(obj.round ?? 0),
                  mentorId: String(obj.mentorId ?? ''),
                  blockingReason: obj.blockingReason ? String(obj.blockingReason) : undefined,
                });
              }
            } catch { /* skip */ }
          }
        }
      }
      await walkJsonl(pkgAbs);
      return { pendingCards: pendingCards.slice(0, 200) };
    }

    case 'feishu_send_message': {
      // 发送（人工批准后由引擎入队才执行）：
      //   kind=file（先核验哈希再上传）
      //   kind=text（G1/G2 纯文本固定文案）
      //   kind=text_mention（G3 富文本，@mention 群里导师 + 固定文案正文）
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
      if (payload.kind === 'text_mention') {
        // G3：post 富文本，@mention 群里导师（排除法定位 open_id）+ 固定文案正文
        const r = await feishuSendPostMention({
          chatId,
          mentorName: payload.mentionMentorName,
          bodyText: payload.bodyText,
          idempotencyKey: payload.idempotencyKey,
          dryRun: payload.dryRun,
        });
        if (!r.ok) throw new Error(`飞书发送 @mention 文案失败: ${r.reason}${r.raw ? `｜raw: ${r.raw.slice(-1500)}` : ''}`);
        return { kind: 'text_mention', ...r };
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

    case 'locate_round2_docs': {
      // S15：在 S14 收步版本包内定位第二轮审核清单 + ying-v0.3 唯一参考
      return locateRound2Docs(contentRoot, payload.mentorDir, payload.packageName);
    }

    case 'read_view_docs': {
      // S8 唯一正文开口：读取 locate 登记过的阅览文档正文，供控制平面 AI 评分
      return readViewDocs(contentRoot, payload.items);
    }

    // P4b：S21 集成六段 + S22 生产发布四段
    case 'git_fetch_status': {
      const phase = payload.phase;
      if (phase === 'reconcile') return await gitFetchStatus(payload);
      if (phase === 'verify') return await verifyProduction(payload);
      return await gitFetchStatus(payload);
    }
    case 'git_backup_create':
      return await gitBackupCreate(payload);
    case 'git_integrate_handoff':
      return await gitIntegrateHandoff(payload, contentRoot);
    case 'run_regression_tests':
      return await runRegressionTests(payload);
    case 'git_push_main':
      return await gitPushMain(payload);
    case 'deploy_staging':
      return await deployStaging(payload);
    case 'activate_mentor_staging':
      return await activateMentorStaging(payload);
    case 'git_promote_main_to_master':
      return await gitPromoteMainToMaster(payload);
    case 'deploy_production':
      return await deployProduction(payload);

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
 * S15 第二轮审核清单候选命名口径：
 * 命中「第二轮审核清单」，但回复稿/更新稿一律排除。
 */
export function isRound2ChecklistFile(base) {
  return /第二轮审核清单/.test(base) && !/回复|更新/.test(base);
}

/**
 * S15 定位第二轮审核清单（AGENTS §13）：
 * - 候选只在 S14 收步指定的版本包目录内找 `<Display_Name>_第二轮审核清单_v<actual>.md`，
 *   版本号以 Assembly 实际文件为准，不硬编码；
 * - 参考固定两份：ying wang 的 ying-v0.3 包 + phyllis chi 的 phyllischi-v0.3 包。
 *   各自内部版本最高一份归为一个参考；同名/同导师多份交由控制平面判歧义。
 * 回复稿/更新稿排除。
 */
export async function locateRound2Docs(contentRoot, mentorDir, packageName) {
  const dir = String(mentorDir || '');
  const pkg = String(packageName || '');
  if (!dir || !pkg || /[\\/]/.test(pkg) || pkg.includes('..')) {
    throw new Error('locate_round2_docs 参数非法（mentorDir/packageName）');
  }
  const mentorRoot = path.join(contentRoot, 'mentors', dir);
  if (!isInsideContentRoot(mentorRoot, contentRoot)) throw new Error(`导师目录越界: ${dir}`);
  const pkgRoot = path.join(mentorRoot, 'work', pkg);
  if (!isInsideContentRoot(pkgRoot, contentRoot)) throw new Error(`版本包目录越界: ${pkg}`);

  const collect = async (scanRoot) => {
    const files = [];
    await walkMdFiles(scanRoot, 0, files);
    const out = [];
    for (const abs of files) {
      const base = path.basename(abs);
      if (!isRound2ChecklistFile(base)) continue;
      try {
        const { sha256, bytes } = await hashFile(abs);
        const m = base.match(/_v(\d+(?:\.\d+)*)/);
        out.push({
          relPath: toDisplayPath(abs, contentRoot),
          absPath: abs,
          docType: 'round2_review_checklist',
          version: m ? `v${m[1]}` : null,
          bytes,
          sha256,
        });
      } catch {
        /* 单文件哈希失败跳过 */
      }
    }
    return out;
  };

  const docs = await collect(pkgRoot);
  // 每位参考导师取版本最高的一份（复用第一轮 S8 的 pickLatestByType：同版本并列保留，交控制平面判歧义）
  const refSpecs = [
    { mentor: 'ying wang', pkg: 'ying-v0.3' },
    { mentor: 'phyllis chi', pkg: 'phyllischi-v0.4-card-approved' },
  ];
  const rawRefs = [];
  for (const { mentor, pkg: refPkg } of refSpecs) {
    if (dir.toLowerCase() === mentor) continue;
    const refRoot = path.join(contentRoot, 'mentors', mentor, 'work', refPkg);
    const found = await collect(refRoot);
    rawRefs.push(...pickLatestByType(found).map((f) => ({ ...f, refMentor: mentor })));
  }
  return { mentorDir: dir, packageName: pkg, docs, refs: rawRefs };
}

/**
 * S8/S15 唯一正文开口：读取 locate 阶段登记过的阅览文档正文回传控制平面。
 * 白名单：文件名必须命中三类正式文档之一；第一轮开口排除 回复/更新/第二轮，
 * 第二轮开口排除 回复/更新；限 .md/.txt、限 200KB；
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
    const isRound2 = /第二轮审核清单/.test(base);
    if (!/语言人格风格分析|第一轮审核清单|第二轮审核清单/.test(base)) {
      throw new Error(`read_view_docs 非白名单文件: ${base}`);
    }
    if (isRound2 ? /回复|更新/.test(base) : EXCLUDED_NAME_RE.test(base)) {
      throw new Error(`read_view_docs 命中排除规则（回复/更新/跨轮）: ${base}`);
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
