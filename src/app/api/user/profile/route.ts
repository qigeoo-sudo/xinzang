/**
 * 用户档案 API
 * GET /api/user/profile - 获取当前用户档案
 * PUT /api/user/profile - 更新当前用户档案
 *
 * 字段来源：AI 职导访谈自动提取 + 用户手动编辑
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { registerProfileSchema, toUserProfileData } from '@/lib/register-v2';

// 更新档案的校验 schema — 覆盖所有字段
const updateProfileSchema = z.object({
  nickname: z.string().max(30).optional(),
  age: z.number().int().min(0).max(150).optional(),
  status: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  school: z.string().max(100).optional(),
  major: z.string().max(100).optional(),
  enrollmentYear: z.string().max(50).optional(),
  industry: z.string().max(50).optional(),
  jobContent: z.string().max(500).optional(),
  companyType: z.string().max(50).optional(),
  jobSatisfaction: z.number().int().min(1).max(5).optional(),
  gradYears: z.string().max(20).optional(),
  interests: z.array(z.string()).max(10).optional(),
  goals: z.string().max(500).optional(),
  infoChannels: z.array(z.string()).optional(),
  careerSpending: z.string().max(500).optional(),
  careerAnxiety: z.string().max(1000).optional(),
  jobChangeStatus: z.string().max(500).optional(),
  helpPriority: z.array(z.string()).optional(),
  mentorPreference: z.array(z.string()).optional(),
  mentorHelpAreas: z.array(z.string()).optional(),
  productInterest: z.string().max(100).optional(),
  productTrigger: z.array(z.string()).optional(),
  productConcern: z.array(z.string()).optional(),
  willingToPay: z.string().max(100).optional(),
});

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
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const d = parsed.data;

    // 数组字段转 JSON 字符串
    const arrayFields = ['interests', 'infoChannels', 'helpPriority', 'mentorPreference', 'mentorHelpAreas', 'productTrigger', 'productConcern'];
    const data: Record<string, unknown> = {};
    const savedNonEmpty: string[] = [];
    for (const [key, value] of Object.entries(d)) {
      if (arrayFields.includes(key) && Array.isArray(value)) {
        data[key] = value.length > 0 ? JSON.stringify(value) : null;
        if (value.length > 0) savedNonEmpty.push(key);
      } else {
        data[key] = value ?? undefined;
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          savedNonEmpty.push(key);
        }
      }
    }

    // register-v2 结构化字段（新注册流程 / 档案分步编辑共用）
    // 全可选，校验失败直接忽略，不影响旧字段保存
    const v2Parsed = registerProfileSchema.safeParse(body);
    if (v2Parsed.success) {
      const v2Data = toUserProfileData(v2Parsed.data);
      for (const [key, value] of Object.entries(v2Data)) {
        data[key] = value; // v2 字段优先，覆盖旧 schema 的同名列（如 status/nickname）
        if (value !== null && String(value).trim() !== '') {
          savedNonEmpty.push(key);
        }
      }
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

    // 手动保存即用户主动确认：清除对应字段的推断(inferredProfile)与待处理冲突(profileConflicts)
    let inferred: Record<string, unknown> = {};
    if (existingProfile?.inferredProfile) {
      try { inferred = JSON.parse(existingProfile.inferredProfile); } catch { inferred = {}; }
    }
    let conflicts: { field: string; status?: string }[] = [];
    if (existingProfile?.profileConflicts) {
      try { conflicts = JSON.parse(existingProfile.profileConflicts); } catch { conflicts = []; }
    }
    for (const field of savedNonEmpty) {
      delete inferred[field];
    }
    if (savedNonEmpty.length > 0) {
      conflicts = conflicts.filter((c) => !savedNonEmpty.includes(c.field));
    }
    data.inferredProfile = JSON.stringify(inferred);
    data.profileConflicts = JSON.stringify(conflicts);

    // 手动确认过 → 来源标记 mixed（仅当之前是 ai_extracted）
    if (savedNonEmpty.length > 0 && existingProfile?.profileSource === 'ai_extracted') {
      data.profileSource = 'mixed';
    }

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
