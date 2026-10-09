import { errorResponse, requireContentOpsUser } from '@/lib/content-ops/server-auth';

/**
 * 查询当前 VPN 连接状态：探测 google.com/generate_204 是否可达。
 */
export async function GET() {
  try {
    await requireContentOpsUser();
    let connected = false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        signal: ctrl.signal,
      });
      connected = res.status === 204;
      clearTimeout(timer);
    } catch {
      connected = false;
    }
    return Response.json({ connected });
  } catch (e) {
    return errorResponse(e);
  }
}
