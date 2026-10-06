import { createRun, listRuns } from '@/lib/content-ops/engine';
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
    const run = await createRun(user.userId, {
      mentorDir: String(body.mentorDir ?? ''),
      feishuChatName: String(body.feishuChatName ?? ''),
      feishuChatId: body.feishuChatId ? String(body.feishuChatId) : undefined,
      isPilot: Boolean(body.isPilot),
    });
    return Response.json({ id: run.id, status: run.status });
  } catch (e) {
    return errorResponse(e);
  }
}
