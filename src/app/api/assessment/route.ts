/**
 * 职业兴趣测评（RIASEC）API
 * GET  /api/assessment - 获取当前用户的测评结果（未测返回 null）
 * POST /api/assessment - 保存/覆盖测评结果（一人一份，重测覆盖）
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { assessmentSchema, toAssessmentCreate } from '@/lib/register-v2';

function parseJsonSafe<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const row = await prisma.interestAssessment.findUnique({
    where: { userId: session.user.id },
  });

  if (!row) {
    return NextResponse.json({ assessment: null });
  }

  return NextResponse.json({
    assessment: {
      id: row.id,
      scores: parseJsonSafe(row.scores, null),
      answers: parseJsonSafe(row.answers, []),
      questionVersion: row.questionVersion,
      code: row.code,
      takenAt: row.takenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = assessmentSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || '测评数据不合法' },
        { status: 400 }
      );
    }

    const payload = toAssessmentCreate(parsed.data);
    const row = await prisma.interestAssessment.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...payload },
      update: payload,
    });

    return NextResponse.json({
      success: true,
      assessment: {
        id: row.id,
        scores: parseJsonSafe(row.scores, null),
        questionVersion: row.questionVersion,
        code: row.code,
        takenAt: row.takenAt,
      },
    });
  } catch (error) {
    console.error('Assessment save error:', error);
    return NextResponse.json(
      { error: '保存失败，请稍后再试' },
      { status: 500 }
    );
  }
}
