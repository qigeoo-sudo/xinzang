import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/header';
import { mentors } from '@/lib/mentors';
import { PageHero, StageShell, PaperPanel, StageTitle, StageCredits } from '@/components/page-shell';
import { RecommendedMentors } from '@/components/recommended-mentors';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/dashboard');
  }

  // 从数据库获取用户数据和聊天历史
  const [user, chatSessions, subscription, userProfile, assessment] = await Promise.all([
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
      select: {
        careers: true,
        careerAnxiety: true,
        helpPriority: true,
        mentorPreference: true,
        workGoal: true,
        status: true,
        registrationCompletedAt: true,
      },
    }),
    prisma.interestAssessment.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
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
    <div className="flex min-h-screen flex-col">
      <Header />

      <PageHero
        eyebrow="Growth Tracking"
        title="成长追踪"
        subtitle="从校园到职场，让每一步都意义非凡"
        watermark="长"
      />

      <StageShell masthead="navigate around any singularity, shape your future">
        {/* 统计卡片：两张小信纸 */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <PaperPanel className="py-5 text-center">
            <p className="font-serif text-3xl font-bold text-brand-500">{totalChats}</p>
            <p className="mt-1 text-xs text-muted">对话次数</p>
          </PaperPanel>
          <PaperPanel className="py-5 text-center">
            <p className="font-serif text-3xl font-bold text-sage-600">{totalMessages}</p>
            <p className="mt-1 text-xs text-muted">对话消息</p>
          </PaperPanel>
        </div>

        {/* 会员状态 */}
        <PaperPanel className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-masthead text-muted">
                Membership
              </p>
              {user?.isPremium ? (
                <>
                  <p className="text-lg font-bold text-sage-600">会员</p>
                  {subscription && (
                    <p className="mt-1 text-xs text-muted">
                      {subscription.plan === 'MONTHLY' ? '月度' : subscription.plan === 'QUARTERLY' ? '季度' : '年度'}会员
                      · 到期 {new Date(subscription.endDate).toLocaleDateString('zh-CN')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-muted">非会员</p>
                  <p className="mt-1 text-xs text-muted">
                    剩余试用 {freeTrialRemaining} / {freeTrialLimit} 次
                  </p>
                </>
              )}
            </div>
            {!user?.isPremium && (
              <Link
                href="/dashboard/subscription?from=/dashboard"
                className="btn-primary !px-3 !py-2 text-xs"
              >
                升级会员
              </Link>
            )}
          </div>
        </PaperPanel>

        {/* 成长里程碑 */}
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between px-1">
            <StageTitle>成长里程碑</StageTitle>
            <span className="text-xs text-white/55">{completedMilestones}/3 完成</span>
          </div>

          {/* 进度条（深展台上的奶白轨道） */}
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-sage-400 transition-all duration-500"
              style={{ width: `${(completedMilestones / 3) * 100}%` }}
            />
          </div>

          <div className="space-y-2.5">
            {milestones.map((milestone) => (
              <PaperPanel
                key={milestone.id}
                className="flex items-center gap-3 p-4"
              >
                {/* 状态图标 */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    milestone.completed
                      ? 'bg-sage-100 text-sage-600'
                      : 'bg-sand-100 text-slate-400'
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brand-900">
                    {milestone.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{milestone.desc}</p>
                </div>
              </PaperPanel>
            ))}
          </div>
        </div>

        {/* 推荐导师：信纸表面直接浮在展台上 */}
        <RecommendedMentors
          profile={{
            status: userProfile?.status ?? null,
            careers: userProfile?.careers ?? null,
            careerAnxiety: userProfile?.careerAnxiety ?? null,
            helpPriority: userProfile?.helpPriority ?? null,
            mentorPreference: userProfile?.mentorPreference ?? null,
            workGoal: userProfile?.workGoal ?? null,
          }}
          showAssessmentHint={!assessment}
          surface="paper"
        />

        <StageCredits lang="zh" />
      </StageShell>
    </div>
  );
}
