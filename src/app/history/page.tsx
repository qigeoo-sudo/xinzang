import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/header';
import { mentors } from '@/lib/mentors';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/history');
  }

  // 获取所有对话记录
  const chatSessions = await prisma.chatSession.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      mentorId: true,
      title: true,
      messageCount: true,
      updatedAt: true,
    },
  });

  // 导师名称映射
  const mentorMap = new Map(mentors.map((m) => [m.id, { name: m.name, avatar: m.avatar }]));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-brand-900">对话记录</h1>
          <p className="text-sm text-slate-500 mt-1">你的所有对话历史</p>
        </div>

        {/* 对话列表 */}
        {chatSessions.length === 0 ? (
          <div className="card text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-base font-medium text-brand-900 mb-2">还没有对话记录</p>
            <p className="text-sm text-slate-400 mb-6">开始你的第一次对话吧</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/chat" className="btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                </svg>
                找榨职机说话
              </Link>
              <Link href="/mentors" className="btn-secondary">
                浏览行业导师
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {chatSessions.map((session) => {
              const mentor = mentorMap.get(session.mentorId);
              return (
                <Link
                  key={session.id}
                  href={session.mentorId === 'ai-guide' ? `/chat?session=${session.id}` : `/mentors/${session.mentorId}`}
                  className="card card-hover flex items-center gap-4"
                >
                  {/* 导师头像 */}
                  <div className="flex-shrink-0">
                    {mentor?.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mentor.avatar}
                        alt={mentor.name}
                        className="w-12 h-12 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-sage-400 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">
                          {mentor?.name?.charAt(0) || 'A'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 对话信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-900 truncate">
                      {session.title || `与 ${mentor?.name || 'AI导师'} 的对话`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {mentor?.name || session.mentorId} · {session.messageCount} 条消息
                    </p>
                  </div>

                  {/* 时间 */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-slate-400">
                      {new Date(session.updatedAt).toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {new Date(session.updatedAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
