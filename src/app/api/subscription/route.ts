/**
 * 订阅管理 API
 * GET /api/subscription — 获取当前用户订阅状态
 *
 * 包含到期检查: 如果订阅已过期，自动更新状态
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  // 查找当前有效订阅
  let subscription = await prisma.subscription.findFirst({
    where: {
      userId: session.user.id,
      status: 'ACTIVE',
    },
    orderBy: { endDate: 'desc' },
    include: {
      paymentOrder: {
        select: {
          orderNo: true,
          amount: true,
          paidAt: true,
        },
      },
    },
  });

  // 到期检查: 如果订阅已过期，更新状态
  if (subscription && subscription.endDate < new Date()) {
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { isPremium: false },
      }),
    ]);

    subscription = null;
  }

  // 获取免费试用次数
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPremium: true,
      freeTrialUsed: true,
    },
  });

  const freeTrialLimit = parseInt(process.env.FREE_TRIAL_COUNT || '3', 10);
  const freeTrialRemaining = Math.max(
    0,
    freeTrialLimit - (user?.freeTrialUsed || 0)
  );

  return NextResponse.json({
    isPremium: user?.isPremium || false,
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          daysRemaining: Math.ceil(
            (subscription.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          ),
          orderNo: subscription.paymentOrder?.orderNo,
          amount: subscription.paymentOrder?.amount,
        }
      : null,
    freeTrial: {
      used: user?.freeTrialUsed || 0,
      limit: freeTrialLimit,
      remaining: freeTrialRemaining,
    },
  });
}
