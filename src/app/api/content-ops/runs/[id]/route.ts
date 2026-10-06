import { getRunDetail } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsUser } from '@/lib/content-ops/server-auth';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireContentOpsUser();
    const detail = await getRunDetail(params.id);
    return Response.json(detail);
  } catch (e) {
    return errorResponse(e);
  }
}
