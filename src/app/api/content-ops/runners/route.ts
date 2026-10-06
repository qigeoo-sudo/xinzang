import { listRunners } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsUser } from '@/lib/content-ops/server-auth';

export async function GET() {
  try {
    await requireContentOpsUser();
    return Response.json({ runners: await listRunners() });
  } catch (e) {
    return errorResponse(e);
  }
}
