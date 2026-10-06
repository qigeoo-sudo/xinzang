import { manualNote } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = await req.json();
    if (!['started', 'completed'].includes(body.phase)) {
      return Response.json({ error: 'phase 必须是 started 或 completed' }, { status: 400 });
    }
    const result = await manualNote(userId, params.id, {
      phase: body.phase as 'started' | 'completed',
      conversationName: body.conversationName ? String(body.conversationName) : undefined,
      note: body.note ? String(body.note) : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
