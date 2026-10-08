import { requestG4Approval } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      evidenceChecks?: {
        preflightAllPassed: boolean;
        pendingAllZeroed: boolean;
        handoffVersionAndHashRecorded: boolean;
        readNoMasterProduction: boolean;
      };
    };
    if (!body.evidenceChecks) {
      return Response.json({ error: '缺少 evidenceChecks' }, { status: 400 });
    }
    const result = await requestG4Approval(userId, params.id, { evidenceChecks: body.evidenceChecks });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
