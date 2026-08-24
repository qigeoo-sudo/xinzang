import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatLockDuration } from '@/lib/lockout';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const identifier = request.nextUrl.searchParams.get('identifier');
  if (!identifier) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  }

  const isPhone = /^1[3-9]\d{9}$/.test(identifier);
  const user = isPhone
    ? await prisma.user.findUnique({ where: { phone: identifier } })
    : await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });

  if (!user) {
    return NextResponse.json({
      message: '手机号/邮箱或密码不正确',
      remainingAttempts: 4,
      isLocked: false,
    });
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    const remainingMs = user.lockUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return NextResponse.json({
      message: `账户已锁定，请${formatLockDuration(remainingMin)}后再试`,
      isLocked: true,
    });
  }

  if (user.loginAttempts >= 5) {
    return NextResponse.json({
      message: '手机号/邮箱或密码不正确',
      remainingAttempts: 0,
      isLocked: false,
    });
  }

  return NextResponse.json({
    message: `手机号/邮箱或密码不正确，还有 ${5 - user.loginAttempts}/5次机会`,
    remainingAttempts: 5 - user.loginAttempts,
    isLocked: false,
  });
}
