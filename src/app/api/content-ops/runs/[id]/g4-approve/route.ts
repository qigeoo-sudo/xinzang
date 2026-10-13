import { grantG4Integration } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

// G4 已取消人工断点：预检全绿 + pending 归零后由控制平面自动放行。
// 本路由仅作人工兜底（自动放行失败时可手动触发），不再需要证据勾选。
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const result = await grantG4Integration(userId, params.id);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
