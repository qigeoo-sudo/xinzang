import { runPreflightNineChecks } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as { forceRetry?: boolean };
    const result = await runPreflightNineChecks(userId, params.id);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
