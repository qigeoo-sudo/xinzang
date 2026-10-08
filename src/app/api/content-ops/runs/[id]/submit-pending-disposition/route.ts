import { submitPendingDisposition } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      cardId?: string;
      disposition?: 'external_approved_generalized' | 'external_approved_exact' | 'internal_approved_none' | 'exclude' | 'keep_pending';
      note?: string;
    };
    if (!body.cardId || !body.disposition) {
      return Response.json({ error: '缺少 cardId 或 disposition' }, { status: 400 });
    }
    const result = await submitPendingDisposition(userId, params.id, {
      cardId: body.cardId,
      disposition: body.disposition,
      note: body.note,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
