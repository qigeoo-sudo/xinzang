import { startRound2UpdateScan } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const result = await startRound2UpdateScan(userId, params.id);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
