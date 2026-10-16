import { submitPendingDispositionBatch, type PendingDisposition } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      items?: Array<{ cardId?: string; disposition?: PendingDisposition; note?: string }>;
    };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return Response.json({ error: '缺少 items 处置条目' }, { status: 400 });
    }
    const normalized = items.map((it) => ({
      cardId: String(it.cardId ?? ''),
      disposition: it.disposition as PendingDisposition,
      note: it.note,
    }));
    const result = await submitPendingDispositionBatch(userId, params.id, normalized);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
