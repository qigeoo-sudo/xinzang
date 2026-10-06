import { authenticateRunnerRequest, handleCommandResult } from '@/lib/content-ops/engine';
import { errorResponse } from '@/lib/content-ops/server-auth';

export async function POST(req: Request) {
  try {
    const runner = await authenticateRunnerRequest(req);
    const body = await req.json();
    if (!body.stepId || !body.idempotencyKey || !['done', 'failed'].includes(body.status)) {
      return Response.json({ error: 'stepId / idempotencyKey / status 非法' }, { status: 400 });
    }
    const result = await handleCommandResult(runner.id, {
      stepId: String(body.stepId),
      idempotencyKey: String(body.idempotencyKey),
      status: body.status as 'done' | 'failed',
      result: body.result,
      error: typeof body.error === 'string' ? body.error.slice(0, 2000) : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
