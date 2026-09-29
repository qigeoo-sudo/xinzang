/**
 * 导师后台 API 共用鉴权 — 所有接口从登录态反查 boundMentorId，
 * 绝不接受前端传参指定 mentorId。
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export interface MentorContext {
  userId: string;
  mentorId: string;
}

export class MentorApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireMentorContext(): Promise<MentorContext> {
  const session = await auth();
  if (!session?.user) {
    throw new MentorApiError(401, '请先登录');
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, boundMentorId: true },
  });
  if (!user || user.role !== 'MENTOR_HUMAN' || !user.boundMentorId) {
    throw new MentorApiError(403, '没有导师后台权限');
  }
  return { userId: session.user.id, mentorId: user.boundMentorId };
}

/** 统一错误响应 */
export function errorResponse(e: unknown): Response {
  if (e instanceof MentorApiError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error('[mentor api]', e);
  return Response.json({ error: '服务异常，请稍后再试' }, { status: 500 });
}
