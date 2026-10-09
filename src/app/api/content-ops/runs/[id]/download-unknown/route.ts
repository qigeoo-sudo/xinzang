import { downloadUnknownCandidates } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = await req.json();
    const result = await downloadUnknownCandidates(userId, params.id, {
      selections: Array.isArray(body.selections) ? body.selections.map(String) : [],
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
