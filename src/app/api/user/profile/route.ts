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
import { MENTOR_PREFERENCE_OPTIONS } from '@/lib/register-options';
import { containsSensitiveWord } from '@/lib/sensitive-words';

// 更新档案的校验 schema — 覆盖所有字段
const updateProfileSchema = z.object({
  nickname: z
    .string()
    .optional()
    .refine(
      (v) => v == null || v === '' || Buffer.byteLength(v, 'utf8') <= 24,
      { message: '昵称最多 24 字节（中文约 8 字）' }
    ),
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
  careerAnxiety: z.string().max(100).optional().nullable(),
  jobChangeStatus: z.string().max(500).optional(),
  helpPriority: z.array(z.string().max(20)).max(1).optional().nullable(),
  mentorPreference: z
    .array(z.string().max(20))
    .max(11)
    .optional()
    .nullable()
    .refine(
      (arr) => !arr || arr.every((v) => MENTOR_PREFERENCE_OPTIONS.some((o) => o.value === v)),
      { message: '想深聊的人包含无效选项' }
    ),
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

    // 昵称敏感词校验（对最终生效值拦截，命中词只进服务端日志，不回显）
    const finalNickname = data.nickname;
    if (typeof finalNickname === 'string' && finalNickname.trim() && containsSensitiveWord(finalNickname)) {
      console.warn('[sensitive] profile nickname blocked, userId =', session.user.id, 'length =', finalNickname.length);
      return NextResponse.json(
        { error: '昵称含违规内容，请修改后再保存', field: 'nickname' },
        { status: 400 }
      );
    }

    // 学校名称敏感词校验（学校不在名单里时保留用户输入，此处做硬校验兜底）
    const finalSchool = data.school;
    if (typeof finalSchool === 'string' && finalSchool.trim() && containsSensitiveWord(finalSchool)) {
      console.warn('[sensitive] profile school blocked, userId =', session.user.id, 'length =', finalSchool.length);
      return NextResponse.json(
        { error: '学校名称含违规内容，请修改后再保存', field: 'school' },
        { status: 400 }
      );
    }

    // “让导师分身更懂你”选填区文本敏感词校验（焦虑自述 + 帮助方面“其他”原文）
    const finalAnxiety = d.careerAnxiety;
    if (typeof finalAnxiety === 'string' && finalAnxiety.trim() && containsSensitiveWord(finalAnxiety)) {
      console.warn('[sensitive] profile careerAnxiety blocked, userId =', session.user.id);
      return NextResponse.json(
        { error: '内容含违规词，请修改后再保存', field: 'careerAnxiety' },
        { status: 400 }
      );
    }
    if (Array.isArray(d.helpPriority) && d.helpPriority.some((v) => v.trim() && containsSensitiveWord(v))) {
      console.warn('[sensitive] profile helpPriority blocked, userId =', session.user.id);
      return NextResponse.json(
        { error: '内容含违规词，请修改后再保存', field: 'helpPriority' },
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
