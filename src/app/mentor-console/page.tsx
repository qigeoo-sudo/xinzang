/**
 * 导师真身后台入口（内部路径；mentor.aihr.top 根路径由 auth.ts Host 路由 rewrite 到此）
 * 服务端鉴权：仅 role=MENTOR_HUMAN 且 boundMentorId 有效可进。
 * 未登录时不再 redirect 到 /login，而是就地渲染登录 gate（MentorConsoleGate）。
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { mentors } from '@/lib/mentors';
import { MentorConsole } from '@/components/mentor-console/mentor-console';
import { MentorConsoleGate } from '@/components/mentor-console/mentor-console-gate';

export const dynamic = 'force-dynamic';

export default async function MentorConsolePage() {
  const session = await auth();
  if (!session?.user) {
    // 未登录：就地渲染登录 gate，不跳出 mentor-console
    return <MentorConsoleGate />;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      boundMentorId: true,
      lastLoginAt: true,
      loginCount: true,
      createdAt: true,
    },
  });

  if (!user || user.role !== 'MENTOR_HUMAN' || !user.boundMentorId) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-stone-800">无法访问导师后台</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          这里是真人导师的工作区。如果你是导师但看到此提示，请联系平台管理员确认账号与分身绑定状态。
        </p>
      </main>
    );
  }

  const mentor = mentors.find((m) => m.id === user.boundMentorId);
  if (!mentor) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-stone-800">分身配置缺失</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          绑定的分身已不在当前配置中，请联系平台管理员处理。
        </p>
      </main>
    );
  }

  return (
    <MentorConsole
      mentorName={mentor.name}
      accountName={session.user.name ?? mentor.name}
      lastLoginAt={user.lastLoginAt?.toISOString() ?? null}
      loginCount={user.loginCount}
    />
  );
}
