import { retryCommand } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = await req.json();
    const result = await retryCommand(userId, params.id, String(body.stepCode ?? ''));
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
