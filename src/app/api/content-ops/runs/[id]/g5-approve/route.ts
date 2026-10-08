import { requestG5Approval } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      evidenceChecks?: {
        stagingAcceptancePassed: boolean;
        readProductionImpact: boolean;
        mainShaLocked: boolean;
        readRollbackPlan: boolean;
      };
    };
    if (!body.evidenceChecks) {
      return Response.json({ error: '缺少 evidenceChecks' }, { status: 400 });
    }
    const result = await requestG5Approval(userId, params.id, { evidenceChecks: body.evidenceChecks });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
