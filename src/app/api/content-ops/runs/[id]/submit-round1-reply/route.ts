import { submitRound1Reply } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as { messageId?: string; manualRelPath?: string };
    const result = await submitRound1Reply(userId, params.id, {
      messageId: body.messageId ? String(body.messageId) : undefined,
      manualRelPath: body.manualRelPath ? String(body.manualRelPath) : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
