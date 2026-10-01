/**
 * 导师视角预览（管理员专用）：渲染该导师登录导师后台后看到的一切。
 * 服务端鉴权：仅 role=ADMIN_FULL（迁移期兼容 ADMIN）。
 * demo 阶段数据走静态 JSON；真实阶段将校验绑定关系并注入该导师的真实统计。
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/admin';
import { getMentorById } from '@/lib/mentors';
import { MentorConsole } from '@/components/mentor-console/mentor-console';
import { MentorConsoleGate } from '@/components/mentor-console/mentor-console-gate';

export const dynamic = 'force-dynamic';

export default async function MentorPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) return <MentorConsoleGate />;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user || !isAdminRole(user.role)) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-stone-800">无法访问该页面</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">导师视角预览仅对平台管理员开放。</p>
      </main>
    );
  }

  const mentor = getMentorById(id);
  const mentorName = mentor?.name ?? id;

  return (
    <div>
      <div className="sticky top-0 z-30 bg-amber-50/95 px-4 py-2 text-center text-xs text-amber-800 backdrop-blur ring-1 ring-amber-200">
        管理员预览视角：你正在查看 {mentorName} 登录导师后台看到的一切 ·{' '}
        <a href="/admin-console/mentors" className="font-semibold underline underline-offset-2">
          返回导师管理
        </a>
      </div>
      <MentorConsole
        mentorName={mentorName}
        accountName={`管理员预览 · ${session.user.name ?? '管理员'}`}
        lastLoginAt={null}
        loginCount={0}
        exitHref="/admin-console/mentors"
      />
    </div>
  );
}
