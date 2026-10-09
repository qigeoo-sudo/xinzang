import { deleteRun, getRunDetail } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin, requireContentOpsUser } from '@/lib/content-ops/server-auth';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireContentOpsUser();
    const detail = await getRunDetail(params.id);
    return Response.json(detail);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const result = await deleteRun(userId, params.id);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
