/**
 * 管理员鉴权 — 所有 /api/admin/* 接口共用
 * 每次从数据库实时校验角色，不信任旧 session token 中的角色快照
 * 角色迁移期：ADMIN_FULL 为新角色，ADMIN 保留兼容直至存量账号全部迁移完成
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'ADMIN_FULL' || role === 'ADMIN';
}

export async function getAdminUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me || !isAdminRole(me.role)) return null;
  return session.user.id;
}
