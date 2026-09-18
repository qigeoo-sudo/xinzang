/**
 * 管理员鉴权 — 所有 /api/admin/* 接口共用
 * 每次从数据库实时校验 role=ADMIN，不信任旧 session token 中的角色快照
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function getAdminUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me || me.role !== 'ADMIN') return null;
  return session.user.id;
}
