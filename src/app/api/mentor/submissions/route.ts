/**
 * 导师提交 — GET 列表 / POST 创建
 * 资料修改（PROFILE_EDIT）与内容纠错、补充（CONTENT_CORRECTION / CONTENT_SUPPLEMENT）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireMentorContext, errorResponse } from '@/lib/mentor-console-api';

const createSchema = z.discriminatedUnion('submissionType', [
  z.object({
    submissionType: z.literal('PROFILE_EDIT'),
    field: z.enum(['avatar', 'tags', 'intro']),
    beforeValue: z.string().max(500).optional(),
    // avatar 允许 base64 图片（≤500KB base64 ≈ 375KB 原始），其余 ≤500 字
    afterValue: z.string().trim().min(1, '请填写修改后的内容'),
  }),
  z.object({
    submissionType: z.enum(['CONTENT_CORRECTION', 'CONTENT_SUPPLEMENT']),
    afterValue: z.string().trim().min(1, '请填写具体内容').max(2000, '内容过长，请精简到 2000 字内'),
  }),
]);

/** 头像 base64 上限（约 375KB 原始图片） */
const AVATAR_MAX_BASE64 = 500 * 1024;

const FIELD_LABEL: Record<string, string> = {
  avatar: '头像',
  tags: '对外关键词标签',
  intro: '对外简介',
};

export async function GET() {
  try {
    const { userId } = await requireMentorContext();
    const submissions = await prisma.mentorSubmission.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        submissionType: true,
        boundMentorId: true,
        beforeValue: true,
        afterValue: true,
        status: true,
        reviewNote: true,
        submittedAt: true,
        reviewedAt: true,
        publishedAt: true,
      },
    });
    return NextResponse.json({
      submissions: submissions.map((s) => ({
        ...s,
        fieldLabel:
          s.submissionType === 'PROFILE_EDIT' && s.beforeValue
            ? (FIELD_LABEL[s.beforeValue] ?? null)
            : null,
        submittedAt: s.submittedAt.toISOString(),
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        publishedAt: s.publishedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, mentorId } = await requireMentorContext();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? '提交内容不符合要求';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const data = parsed.data;

    // 分字段校验长度
    if (data.submissionType === 'PROFILE_EDIT') {
      if (data.field === 'avatar') {
        if (data.afterValue.length > AVATAR_MAX_BASE64) {
          return NextResponse.json({ error: '头像图片过大，请压缩后重试' }, { status: 400 });
        }
      } else if (data.afterValue.length > 500) {
        return NextResponse.json({ error: '内容过长，请控制在 500 字内' }, { status: 400 });
      }
    }

    const submission = await prisma.mentorSubmission.create({
      data: {
        submissionType: data.submissionType,
        userId,
        boundMentorId: mentorId,
        beforeValue:
          data.submissionType === 'PROFILE_EDIT'
            ? data.field
            : null,
        afterValue: data.afterValue,
        status: 'PENDING',
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action:
          data.submissionType === 'PROFILE_EDIT' ? 'profile_update' : 'content_feedback',
        targetId: submission.id,
        metadata: JSON.stringify({
          submissionType: data.submissionType,
          ...(data.submissionType === 'PROFILE_EDIT' ? { field: data.field } : {}),
          mentorId,
        }),
      },
    });

    return NextResponse.json({ success: true, id: submission.id });
  } catch (e) {
    return errorResponse(e);
  }
}
