import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

const execAsync = promisify(exec);

/**
 * 启动 hide.me VPN（异步执行 vpn-on.ps1，不阻塞请求）。
 * 前端轮询 GET /api/content-ops/vpn/status 确认连接成功。
 */
export async function POST() {
  try {
    await requireContentOpsAdmin();
    const script = 'scripts/vpn-on.ps1';
    // 后台执行，不 await（脚本可能耗时 60-90s）
    execAsync(`powershell -ExecutionPolicy Bypass -File "${script}"`, {
      cwd: process.cwd(),
      timeout: 180_000,
    }).catch(() => {
      // 后台执行的错误只记录，不影响本次响应
      console.error('[vpn-on] script failed');
    });
    return Response.json({ started: true, message: 'VPN 连接脚本已启动，请等待 30-90 秒' });
  } catch (e) {
    return errorResponse(e);
  }
}
