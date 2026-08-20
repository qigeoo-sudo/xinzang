/**
 * 档案清空 API
 * POST /api/profile/clear
 * body: { scope?: 'fields' | 'all' }
 *
 * - scope='fields'（默认）：清空个人档案字段（主列 + 推断 + 冲突），保留对话历史，记快照。
 * - scope='all'：清空全部数据 —— 聊天记录(AI职导+导师分身) + 档案历史 + 档案字段。
 *   清空后导师分身将不再记得该用户，聊天时视为首次咨询。
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

    const body = await request.json().catch(() => ({}));
    const scope = body?.scope === 'all' ? 'all' : 'fields';
    const userId = session.user.id;

    if (scope === 'all') {
      // 删除所有聊天记录（AI职导 + 导师分身；ChatMessage 随 ChatSession 级联删除）
      await prisma.chatSession.deleteMany({ where: { userId } });
      // 删除档案变更历史
      await prisma.profileHistory.deleteMany({ where: { userId } });
    } else {
      // 仅清档案字段：记录清空前快照
      const existingProfile = await prisma.userProfile.findUnique({ where: { userId } });
      if (existingProfile) {
        await prisma.profileHistory.create({
          data: {
            userId,
            action: 'clear',
            snapshot: JSON.stringify(existingProfile),
          },
        });
      }
    }

    // 清空档案字段（两种 scope 都执行：主列 + 推断 + 冲突）
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {
        nickname: null,
        age: null,
        status: null,
        city: null,
        education: null,
        school: null,
        major: null,
        grade: null,
        industry: null,
        companyType: null,
        jobSatisfaction: null,
        gradYears: null,
        interests: null,
        goals: null,
        infoChannels: null,
        careerSpending: null,
        careerAnxiety: null,
        jobChangeStatus: null,
        helpPriority: null,
        mentorPreference: null,
        mentorHelpAreas: null,
        productInterest: null,
        productTrigger: null,
        productConcern: null,
        willingToPay: null,
        recommendedMentors: null,
        preferredMentors: null,
        lastAiExtractAt: null,
        profileSource: 'manual',
        inferredProfile: null,
        profileConflicts: null,
      },
    });

    return NextResponse.json({ success: true, scope });
  } catch (error) {
    console.error('Profile clear error:', error);
    return NextResponse.json(
      { error: '清空失败，请稍后再试' },
      { status: 500 }
    );
  }
}
