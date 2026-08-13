/**
 * 会话检查 API
 * GET /api/auth/session
 *
 * 返回当前用户的会话信息
 * 前端可用此接口判断登录状态和会员状态
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
        isPremium: session.user.isPremium,
        freeTrialUsed: session.user.freeTrialUsed,
      },
    },
    { status: 200 }
  );
}
