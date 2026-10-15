import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { errorResponse, requireContentOpsUser } from '@/lib/content-ops/server-auth';

/**
 * 网页一键重启本机 Runner（2026-10-16 方案A）。
 * 仅本地环境可用：生产服务器上没有可拉起的本机 Runner，直接 403。
 * Runner 自带 PID 守卫（runner/src/index.mjs）：新进程启动时会先终止旧进程，
 * 因此这里只需拉起新实例；日志追加写入 runner/.state/runner.out.log 便于排查。
 */
export async function POST() {
  try {
    await requireContentOpsUser();
    if (process.env.NODE_ENV === 'production') {
      return Response.json(
        { ok: false, error: '生产环境不支持网页重启 Runner，请到本机终端操作' },
        { status: 403 },
      );
    }
    const runnerDir = path.join(process.cwd(), 'runner');
    const stateDir = path.join(runnerDir, '.state');
    mkdirSync(stateDir, { recursive: true });
    const logStream = createWriteStream(path.join(stateDir, 'runner.out.log'), { flags: 'a' });
    const child = spawn(process.execPath, ['src/index.mjs'], {
      cwd: runnerDir,
      detached: true,
      stdio: ['ignore', logStream, logStream],
      windowsHide: true,
    });
    child.unref();
    return Response.json({ ok: true, pid: child.pid ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
