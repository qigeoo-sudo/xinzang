/**
 * 指令分派：心跳响应中的 commands 在此串行执行。
 * 安全约束：
 * - 所有文件操作限定在 contentRoot 之内（isInsideContentRoot），越权即失败
 * - 只产出元数据（路径/哈希/字节数/时间），绝不读取/回传文件正文
 * - codex_deliver 在 M5 验证前恒定返回 needs_validation（Q15）
 */
import path from 'node:path';
import { readdir, rename, stat } from 'node:fs/promises';
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

    default:
      throw new Error(`未知指令类型: ${type}`);
  }
}
