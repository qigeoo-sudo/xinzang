/**
 * 指令分派：心跳响应中的 commands 在此串行执行。
 * 安全约束：
 * - 所有文件操作限定在 contentRoot 之内（isInsideContentRoot），越权即失败
 * - 只产出元数据（路径/哈希/字节数/时间），绝不读取/回传文件正文
 * - codex_deliver 在 M5 验证前恒定返回 needs_validation（Q15）
 */
import path from 'node:path';
import {
  hashFile,
  isInsideContentRoot,
  listMentorDirs,
  scanWorkPackages,
  toDisplayPath,
} from './filer.mjs';
import { detectCodex, deliverTrigger } from './codex.mjs';

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

    case 'hash_files': {
      const paths = Array.isArray(payload.paths) ? payload.paths : [];
      if (paths.length === 0 || paths.length > 100) {
        throw new Error('hash_files paths 数量非法（1-100）');
      }
      const results = [];
      for (const p of paths) {
        if (typeof p !== 'string') {
          results.push({ path: String(p), ok: false, reason: 'bad_path' });
          continue;
        }
        const abs = path.resolve(p); // 接收绝对路径；相对路径按 cwd 解析（拒绝）
        if (!path.isAbsolute(p) || !isInsideContentRoot(abs, contentRoot)) {
          results.push({ path: p, ok: false, reason: 'outside_content_root' });
          continue;
        }
        try {
          const { sha256, bytes } = await hashFile(abs);
          results.push({
            path: p,
            displayPath: toDisplayPath(abs, contentRoot),
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
