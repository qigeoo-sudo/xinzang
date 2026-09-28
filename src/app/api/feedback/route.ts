/**
 * 消息反馈 API
 * POST /api/feedback  { messageId, feedbackType, reportReason?, comment? }
 *
 * - 需登录，且只能反馈自己会话中的 assistant 消息
 * - 每条消息至多一条反馈：再次提交按更新处理（可改类型/撤销）
 * - feedbackType: LIKE | DISLIKE | REPORT
 * - reportReason（REPORT 必填）: OFFENSIVE | OFF_TOPIC | HALLUCINATION | REPETITIVE | OTHER
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const feedbackSchema = z
  .object({
    messageId: z.string().min(1).max(40),
    feedbackType: z.enum(['LIKE', 'DISLIKE', 'REPORT']),
    reportReason: z
      .enum(['OFFENSIVE', 'OFF_TOPIC', 'HALLUCINATION', 'REPETITIVE', 'OTHER'])
      .optional(),
    comment: z.string().max(500).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const rate = rateLimit(`feedback:${session.user.id}`, 30, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求不是合法 JSON' }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '提交内容不合法' },
      { status: 400 }
    );
  }
  const { messageId, feedbackType, reportReason, comment } = parsed.data;
  if (feedbackType === 'REPORT' && !reportReason) {
    return NextResponse.json({ error: '请选择报错原因' }, { status: 400 });
  }

  // 查消息并验证：存在、assistant、属于本人会话
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      role: true,
      chatSession: { select: { userId: true, mentorId: true } },
    },
  });
  if (!message) {
    return NextResponse.json({ error: '消息不存在' }, { status: 404 });
  }
  if (message.role !== 'assistant') {
    return NextResponse.json({ error: '只能对导师回复提交反馈' }, { status: 400 });
  }
  if (message.chatSession.userId !== session.user.id) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 });
  }

  // upsert：messageId 唯一，重复提交覆盖旧反馈
  const result = await prisma.messageFeedback.upsert({
    where: { messageId },
    create: {
      messageId,
      userId: session.user.id,
      mentorId: message.chatSession.mentorId,
      feedbackType,
      reportReason: feedbackType === 'REPORT' ? reportReason : null,
      comment: comment || null,
    },
    update: {
      feedbackType,
      reportReason: feedbackType === 'REPORT' ? reportReason : null,
      comment: comment || null,
    },
  });

  return NextResponse.json({ ok: true, feedback: result });
}
