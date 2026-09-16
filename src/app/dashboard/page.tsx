import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/header';
import { mentors } from '@/lib/mentors';
import { HomeFooter } from '@/components/home/home-footer';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/dashboard');
  }

  // 从数据库获取用户数据和聊天历史
  const [user, chatSessions, subscription, userProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        isPremium: true,
        freeTrialUsed: true,
        createdAt: true,
      },
    }),
    prisma.chatSession.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        mentorId: true,
        title: true,
        messageCount: true,
        updatedAt: true,
      },
    }),
    prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
        endDate: { gt: new Date() },
      },
      select: {
        plan: true,
        endDate: true,
      },
    }),
    prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { careers: true, careerAnxiety: true, helpPriority: true, registrationCompletedAt: true },
    }),
  ]);

  // 统计数据
  const totalChats = chatSessions.length;
  const totalMessages = chatSessions.reduce((sum, s) => sum + s.messageCount, 0);
  const freeTrialLimit = parseInt(process.env.FREE_TRIAL_COUNT || '3', 10);
  const freeTrialRemaining = Math.max(0, freeTrialLimit - (user?.freeTrialUsed || 0));

  // 导师名称映射
  const mentorMap = new Map(mentors.map((m) => [m.id, m.name]));

  // 成长里程碑
  const careerCount = (() => {
    try {
      const arr = JSON.parse(userProfile?.careers ?? '[]');
      return Array.isArray(arr) ? arr.length : 0;
    } catch { return 0; }
  })();
  // 职业画像完成判定：填了职业焦虑自述 或 求助方向
  const profileComplete =
    !!(userProfile?.careerAnxiety && userProfile.careerAnxiety.trim()) ||
    (() => {
      try {
        const arr = JSON.parse(userProfile?.helpPriority ?? '[]');
        return Array.isArray(arr) && arr.length > 0;
      } catch { return false; }
    })();
  const profileCompletedAt = userProfile?.registrationCompletedAt
    ? new Date(userProfile.registrationCompletedAt).toLocaleDateString('zh-CN')
    : null;

  const milestones = [
    {
      id: 1,
      title: '完成职业画像',
      desc: '兴趣、性格、技能评估完成',
      completed: profileComplete,
      date: profileComplete ? profileCompletedAt : null,
    },
    {
      id: 2,
      title: '探索 3 个职业方向',
      desc: '在档案中选择 3 个以上感兴趣的职业方向',
      completed: careerCount >= 3,
      date: null,
    },
    {
      id: 3,
      title: '和行业导师对话',
      desc: '选择一位行业导师深入交流',
      completed: totalChats > 0,
      date: null,
    },
  ];

  const completedMilestones = milestones.filter((m) => m.completed).length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container flex-1">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-brand-900">成长追踪</h1>
          <p className="text-sm text-slate-500 mt-1">
            从校园到职场的持续陪伴，看见自己的成长轨迹
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="card text-center py-4">
            <p className="text-3xl font-bold text-brand-500">{totalChats}</p>
            <p className="text-xs text-slate-400 mt-1">对话次数</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-3xl font-bold text-sage-500">{totalMessages}</p>
            <p className="text-xs text-slate-400 mt-1">对话消息</p>
          </div>
        </div>

        {/* 会员状态 */}
        <div className="card mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">会员状态</p>
              {user?.isPremium ? (
                <>
                  <p className="text-lg font-bold text-sage-600">会员</p>
                  {subscription && (
                    <p className="text-xs text-slate-400 mt-1">
                      {subscription.plan === 'MONTHLY' ? '月度' : subscription.plan === 'QUARTERLY' ? '季度' : '年度'}会员
                      · 到期 {new Date(subscription.endDate).toLocaleDateString('zh-CN')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-slate-400">非会员</p>
                  <p className="text-xs text-slate-400 mt-1">
                    剩余试用 {freeTrialRemaining} / {freeTrialLimit} 次
                  </p>
                </>
              )}
            </div>
            {!user?.isPremium && (
              <Link
                href="/dashboard/subscription?from=/dashboard"
                className="btn-primary !py-2 !px-3 text-xs"
              >
                升级会员
              </Link>
            )}
          </div>
        </div>

        {/* 成长里程碑 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-brand-900">成长里程碑</h2>
            <span className="text-xs text-slate-400">{completedMilestones}/3 完成</span>
          </div>

          {/* 进度条 */}
          <div className="w-full h-2 bg-slate-100 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-400 to-sage-400 rounded-full transition-all duration-500"
              style={{ width: `${(completedMilestones / 3) * 100}%` }}
            />
          </div>

          <div className="space-y-2">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={`card flex items-center gap-3 ${milestone.completed ? 'border-sage-200' : 'opacity-60'}`}
              >
                {/* 状态图标 */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    milestone.completed
                      ? 'bg-sage-100 text-sage-600'
                      : 'bg-slate-50 text-slate-300'
                  }`}
                >
                  {milestone.completed ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="text-xs font-bold">{milestone.id}</span>
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${milestone.completed ? 'text-brand-900' : 'text-slate-400'}`}>
                    {milestone.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{milestone.desc}</p>
                </div>

                {/* 日期 */}
                {milestone.completed && milestone.date && (
                  <span className="text-xs text-slate-300 flex-shrink-0">{milestone.date}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <HomeFooter lang="zh" />
    </div>
  );
}
