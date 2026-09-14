/**
 * 对话用量查询 API
 * GET /api/chat/usage
 *
 * 返回：
 * - 导师分身对话：已用次数 / 套餐上限（按当前订阅周期）
 * - AI 职导对话：今日已用次数 / 50
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getMentorQuota, getMentorDailyQuota } from '@/lib/plans';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_MESSAGE_LIMIT = 35;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 获取用户会员状态、免费试用次数、加购余额和当前订阅
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        freeTrialUsed: true,
        mentorCredits: true,
        mentorCreditsConsumed: true,
      },
    });

    const freeTrialLimit = parseInt(process.env.FREE_TRIAL_COUNT || '3', 10);

    // 加购轮次余额（永久有效，会员/非会员通用）
    const creditsBalance = Math.max(
      0,
      (user?.mentorCredits ?? 0) - (user?.mentorCreditsConsumed ?? 0)
    );

    let mentorUsed = 0;
    let mentorLimit: number | null = null;
    let mentorDailyUsed = 0;
    let mentorDailyLimit: number | null = null;
    const twentyFourHoursAgo = new Date(Date.now() - ONE_DAY_MS);

    if (user?.isPremium) {
      // 会员 — 获取当前订阅
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gt: new Date() },
        },
        orderBy: { endDate: 'desc' },
        select: { plan: true, startDate: true },
      });

      if (subscription) {
        mentorLimit = getMentorQuota(subscription.plan);
        mentorDailyLimit = getMentorDailyQuota(subscription.plan);

        // 统计当前订阅周期内所有导师分身的用户消息数
        if (mentorLimit !== null) {
          mentorUsed = await prisma.chatMessage.count({
            where: {
              role: 'user',
              createdAt: { gte: subscription.startDate },
              chatSession: {
                userId,
                mentorId: { not: 'ai-guide' },
              },
            },
          });
        }

        // 统计 24 小时滚动窗口内所有导师分身的用户消息数（每日防蒸馏上限）
        if (mentorDailyLimit !== null) {
          mentorDailyUsed = await prisma.chatMessage.count({
            where: {
              role: 'user',
              createdAt: { gt: twentyFourHoursAgo },
              chatSession: {
                userId,
                mentorId: { not: 'ai-guide' },
              },
            },
          });
        }
      }
    } else {
      // 非会员 — 返回免费试用次数
      mentorUsed = user?.freeTrialUsed ?? 0;
      mentorLimit = freeTrialLimit;
    }

    // AI 职导：统计24小时内的用户消息数
    const aiGuideUsed = await prisma.chatMessage.count({
      where: {
        role: 'user',
        createdAt: { gt: twentyFourHoursAgo },
        chatSession: {
          userId,
          mentorId: 'ai-guide',
        },
      },
    });

    return NextResponse.json({
      mentor: {
        used: mentorUsed,
        limit: mentorLimit, // null = 无限
        dailyUsed: mentorDailyUsed,
        dailyLimit: mentorDailyLimit, // null = 无每日限制（非会员/免费试用）
        creditsBalance, // 加购轮次余额（永久有效）
      },
      aiGuide: {
        used: aiGuideUsed,
        limit: DAILY_MESSAGE_LIMIT,
      },
    });
  } catch (error) {
    console.error('Usage API error:', error instanceof Error ? error.name : 'Unknown');
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
