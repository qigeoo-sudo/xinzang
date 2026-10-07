import { startAiCompare } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    return Response.json(await startAiCompare(userId, params.id));
  } catch (e) {
    return errorResponse(e);
  }
}
