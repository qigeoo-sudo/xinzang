/**
 * 聊天会话消息 API
 * GET /api/chat/sessions/[id]/messages - 获取会话历史消息
 *
 * 修复安全审计 A01-1.3: 需要身份验证 + 会话归属检查
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  // 获取会话并验证归属
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: params.id },
    select: { userId: true, mentorId: true },
  });

  if (!chatSession) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }

  // 安全检查：只能访问自己的会话
  if (chatSession.userId !== session.user.id) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  // 获取消息历史
  const messages = await prisma.chatMessage.findMany({
    where: { chatSessionId: params.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    sessionId: params.id,
    mentorId: chatSession.mentorId,
    messages,
  });
}
