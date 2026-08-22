/**
 * 获取导师最新会话 API
 * GET /api/chat/sessions/latest?mentorId=xxx
 *
 * 用于聊天断点续传：当 localStorage 没有缓存时，从数据库加载最近的会话
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mentorId = searchParams.get('mentorId');

  if (!mentorId) {
    return NextResponse.json(
      { error: '缺少 mentorId 参数' },
      { status: 400 }
    );
  }

  // 获取该导师最近的会话（有消息的）
  const chatSession = await prisma.chatSession.findFirst({
    where: {
      userId: session.user.id,
      mentorId,
      messageCount: { gt: 0 },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      mentorId: true,
      messageCount: true,
      updatedAt: true,
    },
  });

  if (!chatSession) {
    return NextResponse.json({ session: null });
  }

  // 获取该会话的消息
  const messages = await prisma.chatMessage.findMany({
    where: { chatSessionId: chatSession.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    session: chatSession,
    messages,
  });
}
