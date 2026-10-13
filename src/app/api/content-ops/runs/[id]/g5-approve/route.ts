import { acceptStagingAndPublish } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

// G5 已改为单按钮放行（无四项证据勾选）：测试端验收通过 → 自动推 master、部署生产、验证。
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const result = await acceptStagingAndPublish(userId, params.id);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
