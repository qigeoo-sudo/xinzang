import { resumeAfterAvatar } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

// S21 prepare_mentor 头像等待恢复：Trae 画完头像后重新入队复检（Runner 复检通过即续链条）。
// body 可选：{ gender?: 'male'|'female' } 补录新导师性别；{ forceTemplate?: true } 改用模板头像兜底。
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as { gender?: string; forceTemplate?: boolean };
    const gender = body.gender === 'male' || body.gender === 'female' ? body.gender : undefined;
    const result = await resumeAfterAvatar(userId, params.id, {
      gender,
      forceTemplate: body.forceTemplate === true,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
