/**
 * 档案清空 API — 清空用户全部职业相关数据
 * POST /api/profile/clear
 *
 * 删除范围（数据库不保留快照）：
 * - 聊天会话与消息（ChatMessage 随 ChatSession 级联删除）
 * - 档案变更历史（ProfileHistory）
 * - 职业兴趣测评（InterestAssessment）
 * - 档案字段全部置空（UserProfile 保留行，账号本身不受影响）
 *
 * 不删除：账号、订单、订阅（财务记录需保留）。
 * 清空后导师分身不再记得该用户，聊天视为首次咨询。
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const userId = session.user.id;

    await prisma.$transaction([
      // 聊天记录（消息级联删除）
      prisma.chatSession.deleteMany({ where: { userId } }),
      // 档案变更历史
      prisma.profileHistory.deleteMany({ where: { userId } }),
      // 职业兴趣测评
      prisma.interestAssessment.deleteMany({ where: { userId } }),
      // 档案字段全部置空
      prisma.userProfile.upsert({
        where: { userId },
        create: { userId },
        update: {
          nickname: null,
          status: null,
          school: null,
          major: null,
          careerAnxiety: null,
          helpPriority: null,
          mentorPreference: null,
          birthMonth: null,
          enrollMonth: null,
          expectedGrad: null,
          gradMonth: null,
          workGoal: null,
          fullTimeExp: null,
          partTimeExp: null,
          workProvince: null,
          workCity: null,
          curProvince: null,
          curCity: null,
          careers: null,
          registrationCompletedAt: null,
          contactEmail: null,
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Profile clear error:', error);
    return NextResponse.json(
      { error: '清空失败，请稍后再试' },
      { status: 500 }
    );
  }
}
