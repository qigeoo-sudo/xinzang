/**
 * 用户档案 API
 * GET /api/user/profile - 获取当前用户档案
 * PUT /api/user/profile - 更新当前用户档案（register-v2 字段集）
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { registerProfileSchema, toUserProfileData } from '@/lib/register-v2';
import { containsProfanity } from '@/lib/profanity';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const [profile, assessmentRow, user] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    }),
    prisma.interestAssessment.findUnique({
      where: { userId: session.user.id },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    }),
  ]);

  // scores/answers 落库为 JSON 字符串，这里解析后给前端直接用
  let assessment = null;
  if (assessmentRow) {
    try {
      assessment = {
        code: assessmentRow.code,
        questionVersion: assessmentRow.questionVersion,
        takenAt: assessmentRow.takenAt.toISOString(),
        scores: JSON.parse(assessmentRow.scores),
        answers: JSON.parse(assessmentRow.answers),
      };
    } catch {
      assessment = null;
    }
  }

  return NextResponse.json({ profile, assessment, phone: user?.phone ?? null });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = registerProfileSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const data = toUserProfileData(d);

    // 昵称不文明用语校验（迷你手工词库，命中词只进服务端日志，不回显）
    if (typeof d.nickname === 'string' && d.nickname.trim() && containsProfanity(d.nickname)) {
      console.warn('[profanity] profile nickname blocked, userId =', session.user.id, 'length =', d.nickname.length);
      return NextResponse.json(
        { error: '昵称含不文明用语，请修改后再保存', field: 'nickname' },
        { status: 400 }
      );
    }

    // 学校名称不文明用语校验（学校不在名单里时保留用户输入，此处做硬校验兜底）
    if (typeof d.school === 'string' && d.school.trim() && containsProfanity(d.school)) {
      console.warn('[profanity] profile school blocked, userId =', session.user.id, 'length =', d.school.length);
      return NextResponse.json(
        { error: '学校名称含不文明用语，请修改后再保存', field: 'school' },
        { status: 400 }
      );
    }

    // “让导师分身更懂你”选填区文本不文明用语校验（焦虑自述 + 帮助方面“其他”原文）
    if (typeof d.careerAnxiety === 'string' && d.careerAnxiety.trim() && containsProfanity(d.careerAnxiety)) {
      console.warn('[profanity] profile careerAnxiety blocked, userId =', session.user.id);
      return NextResponse.json(
        { error: '内容含不文明用语，请修改后再保存', field: 'careerAnxiety' },
        { status: 400 }
      );
    }
    if (Array.isArray(d.helpPriority) && d.helpPriority.some((v) => v.trim() && containsProfanity(v))) {
      console.warn('[profanity] profile helpPriority blocked, userId =', session.user.id);
      return NextResponse.json(
        { error: '内容含不文明用语，请修改后再保存', field: 'helpPriority' },
        { status: 400 }
      );
    }

    // 记录变更历史（upsert 之前查询现有档案快照）
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    });
    await prisma.profileHistory.create({
      data: {
        userId: session.user.id,
        action: 'update',
        snapshot: JSON.stringify(existingProfile),
      },
    });

    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        ...data,
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
