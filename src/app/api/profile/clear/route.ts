/**
 * 档案一键清空 API
 * POST /api/profile/clear
 *
 * 将当前用户档案的所有可空字段清空为 null（保留记录，不删除）。
 * 清空前会将现有档案快照写入 ProfileHistory（action: 'clear'），
 * 以便后续追溯恢复。
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    // 1. 查询现有档案
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    });

    // 2. 若存在档案，则记录变更历史并清空所有可空字段
    if (existingProfile) {
      // 记录清空前的档案快照
      await prisma.profileHistory.create({
        data: {
          userId: session.user.id,
          action: 'clear',
          snapshot: JSON.stringify(existingProfile),
        },
      });

      // 清空档案内容（不删除记录，将所有可空字段设为 null）
      await prisma.userProfile.update({
        where: { userId: session.user.id },
        data: {
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
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Profile clear error:', error);
    return NextResponse.json(
      { error: '清空失败，请稍后再试' },
      { status: 500 }
    );
  }
}
