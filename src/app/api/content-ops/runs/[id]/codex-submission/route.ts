import { codexSubmission } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = await req.json();
    if (!['copied', 'started'].includes(body.action)) {
      return Response.json({ error: 'action 必须是 copied 或 started' }, { status: 400 });
    }
    const result = await codexSubmission(userId, params.id, {
      action: body.action as 'copied' | 'started',
      conversationName: body.conversationName ? String(body.conversationName) : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
