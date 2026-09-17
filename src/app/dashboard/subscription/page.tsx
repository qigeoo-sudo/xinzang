import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/header';
import { StageCredits, GoldFlakes, PageHero } from '@/components/page-shell';
import { SubscriptionFlow } from '@/components/subscription-flow';
import { SUBSCRIPTION_PLANS, CREDIT_PACKS, type PlanId } from '@/lib/plans';

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
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
    select: {
      isPremium: true,
      freeTrialUsed: true,
      mentorCredits: true,
      mentorCreditsConsumed: true,
    },
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

  // 已购买的多榨卡累计张数（按已支付订单 metadata.quantity 求和）
  const packOrders = await prisma.paymentOrder.findMany({
    where: { userId: session.user.id, paymentType: 'CREDIT_PACK', status: 'PAID' },
    select: { metadata: true },
  });
  const packCount = packOrders.reduce((sum, o) => {
    try {
      const qty = JSON.parse(o.metadata || '{}').quantity;
      return sum + (typeof qty === 'number' && qty > 0 ? Math.trunc(qty) : 0);
    } catch {
      return sum;
    }
  }, 0);

  const isPremium = !!user?.isPremium && !!subscription;

  // 多榨卡当前持有余额（累计购买 − 累计消耗）
  const creditBalance = Math.max(
    0,
    (user?.mentorCredits ?? 0) - (user?.mentorCreditsConsumed ?? 0)
  );

  return (
    <div className="relative min-h-screen flex flex-col home-backdrop overflow-hidden">
      <Header />
      <GoldFlakes variant="dark" />

      <PageHero
        eyebrow="MEMBERSHIP"
        title={isPremium ? '我的会员' : '升级会员'}
        subtitle={
          isPremium
            ? `你当前是${planNames[subscription!.plan] || '会员'}`
            : '解锁 AI 导师分身对话，获得完整职业指导体验。'
        }
        watermark="会"
      >
        {isPremium && packCount > 0 && (
          <p className="mt-2 text-[12px] text-white/70">
            你当前已购买 {packCount} 张多榨卡
          </p>
        )}
      </PageHero>

      <div className="relative z-10 mx-auto w-full max-w-[840px] px-4 pt-6 pb-4 md:px-6">
        {/* 订阅方案 + 支付流程；当前生效卡在组件内置顶显示 */}
        <SubscriptionFlow
          plans={SUBSCRIPTION_PLANS}
          creditPacks={CREDIT_PACKS}
          currentPlanId={currentPlanId}
          isPremium={isPremium}
          from={searchParams.from}
          activeSubscription={
            subscription
              ? {
                  plan: subscription.plan as PlanId,
                  endDate: subscription.endDate.toISOString(),
                  daysRemaining,
                }
              : null
          }
          freeTrialRemaining={freeTrialRemaining}
          freeTrialLimit={freeTrialLimit}
          creditBalance={creditBalance}
        />

        {/* 底部说明 */}
        <p className="text-center text-xs text-white/45 mt-6 leading-relaxed">
          支付即表示同意会员服务条款
          <br />
          导师分身对话次数按订阅周期计算，到期后重置
        </p>
        <p className="text-center text-xs mt-2">
          <Link
            href="/dashboard/subscription/qa"
            className="text-white/70 hover:text-white underline underline-offset-2"
          >
            购买Q&amp;A（升级规则 / 轮次计算 / 多榨卡说明）
          </Link>
        </p>
      </div>

      <StageCredits lang="zh" />
    </div>
  );
}
