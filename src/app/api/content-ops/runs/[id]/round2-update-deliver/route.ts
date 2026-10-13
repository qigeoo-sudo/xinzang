import { startRound2UpdateDeliver } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

// S14 自动投递（2026-10-13 用户定）：Runner 经 CLI 续话投递第二轮更新触发语；也是失败后的重试入口
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const result = await startRound2UpdateDeliver(userId, params.id);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
