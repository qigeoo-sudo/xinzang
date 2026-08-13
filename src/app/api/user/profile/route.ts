/**
 * 用户档案 API
 * GET /api/user/profile - 获取当前用户档案
 * PUT /api/user/profile - 更新用户档案
 *
 * 修复安全审计 A01-1.3: 所有用户数据操作需要身份验证
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { updateProfileSchema } from '@/lib/validation';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ profile });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const { education, school, major, grade, interests, goals } = parsed.data;

    // upsert: 如果档案不存在则创建，存在则更新
    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        education: education ?? undefined,
        school: school ?? undefined,
        major: major ?? undefined,
        grade: grade ?? undefined,
        interests: interests ? JSON.stringify(interests) : undefined,
        goals: goals ?? undefined,
      },
      create: {
        userId: session.user.id,
        education: education ?? undefined,
        school: school ?? undefined,
        major: major ?? undefined,
        grade: grade ?? undefined,
        interests: interests ? JSON.stringify(interests) : undefined,
        goals: goals ?? undefined,
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { error: '保存失败，请稍后再试' },
      { status: 500 }
    );
  }
}
