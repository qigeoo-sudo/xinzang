import { rejectG4 } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    if (!body.reason || body.reason.trim().length < 5) {
      return Response.json({ error: '驳回原因不少于 5 字' }, { status: 400 });
    }
    const result = await rejectG4(userId, params.id, { reason: body.reason });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
