import { confirmArchive } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = await req.json();
    const result = await confirmArchive(userId, params.id, {
      r3Checked: Boolean(body.r3Checked),
      modelName: body.modelName ? String(body.modelName) : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
