import { CONFIGURABLE_STOPS, createRun, listRuns, type ConfigurableStop } from '@/lib/content-ops/engine';
import {
  assertMethodAllowed,
  errorResponse,
  requireContentOpsUser,
} from '@/lib/content-ops/server-auth';

export async function GET() {
  try {
    const user = await requireContentOpsUser();
    assertMethodAllowed(user.canWrite, 'GET');
    return Response.json({ runs: await listRuns() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireContentOpsUser();
    assertMethodAllowed(user.canWrite, 'POST');
    const body = await req.json();
    const stops: Partial<Record<ConfigurableStop, boolean>> = {};
    for (const code of CONFIGURABLE_STOPS) {
      if (typeof body.stops?.[code] === 'boolean') stops[code] = Boolean(body.stops[code]);
    }
    const run = await createRun(user.userId, {
      mentorDir: String(body.mentorDir ?? ''),
      feishuChatName: String(body.feishuChatName ?? ''),
      feishuChatId: body.feishuChatId ? String(body.feishuChatId) : undefined,
      isPilot: Boolean(body.isPilot),
      stops,
    });
    return Response.json({ id: run.id, status: run.status });
  } catch (e) {
    return errorResponse(e);
  }
}
