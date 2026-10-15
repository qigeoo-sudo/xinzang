import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/header';
import { StageCredits, GoldFlakes, PageHero } from '@/components/page-shell';
import { SubscriptionFlow } from '@/components/subscription-flow';
import { PaywallTracker } from '@/components/paywall-tracker';
import { SUBSCRIPTION_PLANS, SINGLE_MENTOR_PLANS, CREDIT_PACKS, type PlanId, type SubscriptionScope } from '@/lib/plans';
import { getMentorById } from '@/lib/mentors';
import { getSubscriptionRoundsRemaining } from '@/lib/chat-quota';

/** from 参数归一化：接受裸分身 ID 或 /mentors/{id} 路径，返回有效分身 ID */
function resolveSourceMentorId(from?: string): string | undefined {
  if (!from) return undefined;
  const bare = from.startsWith('/mentors/') ? from.slice('/mentors/'.length) : from;
  const id = bare.split(/[?#]/)[0];
  return getMentorById(id) ? id : undefined;
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: { from?: string; tab?: string };
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/dashboard/subscription');
  }

  // 获取当前订阅状态（含范围与绑定分身）
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: session.user.id,
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    },
    orderBy: { endDate: 'desc' },
    select: {
      plan: true,
      scope: true,
      mentorId: true,
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
      profile: { select: { nickname: true } },
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

  // 当前卡剩余轮次（无订阅时为 0；切换互斥判断与前端展示共用）
  const roundsRemaining = subscription
    ? await getSubscriptionRoundsRemaining({
        userId: session.user.id,
        plan: subscription.plan,
        scope: subscription.scope,
        mentorId: subscription.mentorId,
        startDate: subscription.startDate,
      })
    : 0;

  // from 是有效分身 ID（或 /mentors/{id} 路径）时作为来源分身（入口来自该分身对话/选我）
  const sourceMentorId = resolveSourceMentorId(searchParams.from);
  const sourceMentor = sourceMentorId ? getMentorById(sourceMentorId) : undefined;

  // 方案标签：优先 URL 显式参数（选我/选所有按钮带入），其次按当前生效卡范围，无卡默认单导师
  const initialTab: SubscriptionScope =
    searchParams.tab === 'all'
      ? 'ALL'
      : searchParams.tab === 'single'
        ? 'SINGLE'
        : subscription?.scope === 'ALL'
          ? 'ALL'
          : 'SINGLE';

  // 当前生效卡绑定分身名（单导师生效卡展示用）
  const boundMentorName =
    subscription?.scope === 'SINGLE' && subscription.mentorId
      ? getMentorById(subscription.mentorId)?.name
      : undefined;

  return (
    <div className="relative min-h-screen flex flex-col home-backdrop overflow-hidden">
      <Header />
      <GoldFlakes variant="dark" excludeZone={[18, 55]} />
      <PaywallTracker
        from={sourceMentorId ? 'mentor_chat' : searchParams.from}
        sourceMentorId={sourceMentorId}
      />

      <PageHero
        eyebrow="MEMBERSHIP"
        title="欢迎加入榨职社"
        subtitle={
          isPremium
            ? `你当前是${subscription!.scope === 'ALL' ? '全' : '单'}导师${planNames[subscription!.plan] || '会员'}`
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
          singlePlans={SINGLE_MENTOR_PLANS}
          creditPacks={CREDIT_PACKS}
          currentPlanId={currentPlanId}
          currentScope={(subscription?.scope as SubscriptionScope | undefined) ?? null}
          isPremium={isPremium}
          from={searchParams.from}
          sourceMentorId={sourceMentorId}
          sourceMentorName={sourceMentor?.name}
          initialTab={initialTab}
          roundsRemaining={roundsRemaining === Number.POSITIVE_INFINITY ? -1 : roundsRemaining}
          activeSubscription={
            subscription
              ? {
                  plan: subscription.plan as PlanId,
                  scope: subscription.scope as SubscriptionScope,
                  mentorId: subscription.mentorId,
                  boundMentorName,
                  endDate: subscription.endDate.toISOString(),
                  daysRemaining,
                }
              : null
          }
          freeTrialRemaining={freeTrialRemaining}
          freeTrialLimit={freeTrialLimit}
          creditBalance={creditBalance}
          nickname={user?.profile?.nickname || undefined}
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
