import { authenticateRunnerRequest, ingestHeartbeat } from '@/lib/content-ops/engine';
import { errorResponse } from '@/lib/content-ops/server-auth';

export async function POST(req: Request) {
  try {
    const runner = await authenticateRunnerRequest(req);
    const body = await req.json();
    const result = await ingestHeartbeat(runner.id, {
      probes: body.probes,
      contentRoot: typeof body.contentRoot === 'string' ? body.contentRoot : undefined,
      dirs: body.dirs,
      stale: body.stale === true,
      codeMtime: typeof body.codeMtime === 'number' ? body.codeMtime : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
