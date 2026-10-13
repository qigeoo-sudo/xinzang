import { startRound1AbsorbDeliver } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

// S11 自动投递（2026-10-12 方案A）：Runner 经 CLI 续话投递吸收触发语；也是失败后的重试入口
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const result = await startRound1AbsorbDeliver(userId, params.id);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
