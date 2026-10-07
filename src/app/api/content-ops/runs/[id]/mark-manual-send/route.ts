import { markRound1ManualSend } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      confirm?: { filesSent?: boolean; textSent?: boolean };
      note?: string;
    };
    const result = await markRound1ManualSend(userId, params.id, body);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
