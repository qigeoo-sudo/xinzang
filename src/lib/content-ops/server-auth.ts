/**
 * 工作台 API 鉴权（设计文档 §15.1 / Q5）：
 * - ADMIN_FULL：唯一管理员，可读可写（全部门禁按钮）
 * - CONTENT_VIEWER：只读观察账号，仅 GET，所有写接口 403，前端不渲染按钮
 * - 角色实时查库，不信任 JWT 快照
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const CONTENT_OPS_ROLES = {
  ADMIN: 'ADMIN_FULL',
  VIEWER: 'CONTENT_VIEWER',
} as const;

export class ContentOpsApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireContentOpsUser(): Promise<{
  userId: string;
  role: string;
  canWrite: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new ContentOpsApiError(401, '请先登录');
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (!user) throw new ContentOpsApiError(401, '请先登录');
  if (user.role === CONTENT_OPS_ROLES.ADMIN) {
    return { userId: user.id, role: user.role, canWrite: true };
  }
  if (user.role === CONTENT_OPS_ROLES.VIEWER) {
    return { userId: user.id, role: user.role, canWrite: false };
  }
  throw new ContentOpsApiError(403, '没有内容工作台权限');
}

export async function requireContentOpsAdmin(): Promise<{ userId: string }> {
  const ctx = await requireContentOpsUser();
  if (!ctx.canWrite) throw new ContentOpsApiError(403, '只读账号不能执行该操作');
  return { userId: ctx.userId };
}

/** 只读账号在 GET 之外一律 403（路由入口统一调用） */
export function assertMethodAllowed(canWrite: boolean, method: string) {
  if (method !== 'GET' && !canWrite) {
    throw new ContentOpsApiError(403, '只读账号不能执行该操作');
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ContentOpsApiError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  // 兼容 engine.EngineError 等任何携带 status 的业务错误
  if (e instanceof Error && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
    return Response.json({ error: e.message }, { status: (e as { status: number }).status });
  }
  console.error('[content-ops api]', e);
  return Response.json({ error: '服务异常，请稍后再试' }, { status: 500 });
}
