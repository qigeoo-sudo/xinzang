import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/header';
import { SubscriptionFlow } from '@/components/subscription-flow';
import { SUBSCRIPTION_PLANS, type PlanId } from '@/lib/plans';

export default async function SubscriptionPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/dashboard/subscription');
  }

  // 获取当前订阅状态
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: session.user.id,
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    },
    orderBy: { endDate: 'desc' },
    select: {
      plan: true,
      endDate: true,
      startDate: true,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPremium: true, freeTrialUsed: true },
  });

  const freeTrialLimit = parseInt(process.env.FREE_TRIAL_COUNT || '3', 10);
  const freeTrialRemaining = Math.max(
    0,
    freeTrialLimit - (user?.freeTrialUsed || 0)
  );

  const daysRemaining = subscription
    ? Math.ceil(
        (subscription.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      )
    : 0;

  const planNames: Record<string, string> = {
    MONTHLY: '月度会员',
    QUARTERLY: '季度会员',
    YEARLY: '年度会员',
  };

  // 当前会员等级 (用于判断哪些方案可升级)
  const currentPlanId = subscription?.plan as PlanId | undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-ink mb-2">
            {user?.isPremium ? '我的会员' : '升级会员'}
          </h1>
          <p className="text-sm text-muted">
            {user?.isPremium
              ? '你正在享受会员全部权益'
              : '解锁无限次 AI 导师对话，获得完整职业指导体验'}
          </p>
        </div>

        {/* 当前状态 */}
        <div className="card mb-6">
          {user?.isPremium && subscription ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-success/10 mb-3">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-sm text-success font-medium">
                  会员生效中
                </span>
              </div>
              <p className="text-lg font-bold text-ink">
                {planNames[subscription.plan] || subscription.plan}
              </p>
              <p className="text-sm text-muted mt-1">
                到期时间: {subscription.endDate.toLocaleDateString('zh-CN')}
              </p>
              <p className="text-xs text-muted mt-1">
                剩余 {daysRemaining} 天
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted">当前为免费用户</p>
              <p className="text-lg font-bold text-warm mt-1">
                剩余免费试用: {freeTrialRemaining} / {freeTrialLimit} 次
              </p>
            </div>
          )}
        </div>

        {/* 订阅方案 + 支付流程 — 已是会员也显示，用于升级 */}
        <SubscriptionFlow
          plans={SUBSCRIPTION_PLANS}
          currentPlanId={currentPlanId}
          isPremium={!!user?.isPremium}
        />

        {/* 底部说明 */}
        <p className="text-center text-xs text-muted mt-6 leading-relaxed">
          支付即表示同意会员服务条款
          <br />
          导师分身对话次数按订阅周期计算，到期后重置
        </p>
      </div>
    </div>
  );
}
