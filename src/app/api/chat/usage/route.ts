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
import { getMentorQuota } from '@/lib/plans';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_MESSAGE_LIMIT = 35;

export const dynamic = 'force-dynamic';

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

    // 获取用户会员状态、免费试用次数和当前订阅
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true, freeTrialUsed: true },
    });

    const freeTrialLimit = parseInt(process.env.FREE_TRIAL_COUNT || '3', 10);

    let mentorUsed = 0;
    let mentorLimit: number | null = null;

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
      }
      // mentorLimit 为 null 表示无限次（高级套餐）
    } else {
      // 非会员 — 返回免费试用次数
      mentorUsed = user?.freeTrialUsed ?? 0;
      mentorLimit = freeTrialLimit;
    }

    // AI 职导：统计24小时内的用户消息数
    const twentyFourHoursAgo = new Date(Date.now() - ONE_DAY_MS);
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
