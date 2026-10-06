/**
 * 导师访谈龙虾工作台总览（内部路径 /content-ops；content.aihr.top 根路径由 auth.ts Host 路由 rewrite 到此）。
 * 服务端鉴权：ADMIN_FULL（可写）/ CONTENT_VIEWER（只读）；未登录就地渲染登录 gate。
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/admin';
import { ContentOpsConsole } from '@/components/content-ops/content-ops-console';
import { ContentOpsGate } from '@/components/content-ops/content-ops-gate';

export const dynamic = 'force-dynamic';

export default async function ContentOpsPage() {
  const session = await auth();
  if (!session?.user) {
    return <ContentOpsGate />;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const role = user?.role;
  const canWrite = isAdminRole(role);
  if (!canWrite && role !== 'CONTENT_VIEWER') {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-stone-800">🦞 无法访问龙虾工作台</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          这里仅对内容运营成员开放。如果你应该有权限，请联系管理员确认账号角色。
        </p>
      </main>
    );
  }

  const envLabel =
    process.env.NODE_ENV !== 'production'
      ? 'development'
      : process.env.DEPLOY_ENV === 'staging'
        ? 'staging'
        : 'production';

  return (
    <ContentOpsConsole
      accountName={session.user.name ?? '运营成员'}
      canWrite={canWrite}
      envLabel={envLabel}
    />
  );
}
