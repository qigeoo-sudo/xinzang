/**
 * 聊天会话 API
 * POST /api/chat/sessions - 创建新会话
 * GET  /api/chat/sessions - 获取会话列表
 *
 * 修复安全审计 A01-1.3: 需要身份验证
 * 修复安全审计 A02-2.1: 付费导师需会员或免费试用
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getMentorById } from '@/lib/mentors';
import { rateLimit } from '@/lib/rate-limit';

// 创建新会话
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  // 速率限制
  const rateCheck = rateLimit(`session-create:${session.user.id}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: '操作过于频繁，请稍后再试' },
      { status: 429 }
    );
  }

  try {
    const { mentorId } = await request.json();

    if (!mentorId || typeof mentorId !== 'string') {
      return NextResponse.json(
        { error: '缺少 mentorId 参数' },
        { status: 400 }
      );
    }

    const mentor = getMentorById(mentorId);
    if (!mentor) {
      return NextResponse.json(
        { error: '导师不存在' },
        { status: 404 }
      );
    }

    // 获取用户信息检查权限
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPremium: true, freeTrialUsed: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 付费导师权限检查
    if (!mentor.isFree && !user.isPremium) {
      return NextResponse.json(
        { error: '该导师需要会员才能对话', needSubscription: true },
        { status: 403 }
      );
    }

    // 创建新会话
    const chatSession = await prisma.chatSession.create({
      data: {
        userId: session.user.id,
        mentorId: mentor.id,
        title: `与${mentor.name}的对话`,
        messageCount: 0,
      },
    });

    return NextResponse.json({ session: chatSession }, { status: 201 });
  } catch (error) {
    console.error('Create session error:', error);
    return NextResponse.json(
      { error: '创建会话失败' },
      { status: 500 }
    );
  }
}

// 获取会话列表
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const sessions = await prisma.chatSession.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  return NextResponse.json({ sessions });
}
