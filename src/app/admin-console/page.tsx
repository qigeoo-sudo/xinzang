/**
 * 平台数据后台入口（内部路径，与 /mentor-console 对称）。
 * 服务端鉴权：仅 role=ADMIN_FULL（迁移期兼容 ADMIN）可进。
 * 未登录时不 redirect 到 /login，而是就地渲染登录 gate（AdminConsoleGate）。
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/admin';
import { AdminConsole } from '@/components/admin-console/admin-console';
import { AdminConsoleGate } from '@/components/admin-console/admin-console-gate';

export const dynamic = 'force-dynamic';

export default async function AdminConsolePage() {
  const session = await auth();
  if (!session?.user) {
    // 未登录：就地渲染登录 gate，不跳出 admin-console
    return <AdminConsoleGate />;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!user || !isAdminRole(user.role)) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-stone-800">无法访问平台数据后台</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          这里仅对平台管理员开放。如果你是管理员但看到此提示，请联系负责人确认账号角色。
        </p>
      </main>
    );
  }

  return <AdminConsole accountName={session.user.name ?? '管理员'} />;
}
