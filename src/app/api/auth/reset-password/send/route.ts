/**
 * 发送重置密码验证码 API (Mock)
 * POST /api/auth/reset-password/send
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { z } from 'zod';

const schema = z.object({
  method: z.enum(['phone', 'email']),
  target: z.string().min(1, '请输入手机号或邮箱'),
});

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateCheck = rateLimit(`reset-send:${clientIP}`, 5, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const { method, target: rawTarget } = parsed.data;
    const target = method === 'email' ? rawTarget.toLowerCase() : rawTarget;
    const type = method === 'phone' ? 'PHONE_LOGIN' : 'EMAIL_LOGIN';

    // 校验格式 & 检查用户是否存在
    if (method === 'phone') {
      if (!/^1[3-9]\d{9}$/.test(target)) {
        return NextResponse.json({ error: '请输入有效的手机号码' }, { status: 400 });
      }
      const user = await prisma.user.findUnique({ where: { phone: target } });
      if (!user) {
        return NextResponse.json({ error: '该手机号未注册' }, { status: 404 });
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
        return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
      }
      const user = await prisma.user.findUnique({ where: { email: target.toLowerCase() } });
      if (!user) {
        return NextResponse.json({ error: '该邮箱未注册' }, { status: 404 });
      }
    }

    // 生成6位密码学安全随机验证码
    const { randomInt } = await import('crypto');
    const code = randomInt(100000, 1000000).toString();

    await prisma.verificationCode.deleteMany({
      where: { identifier: target, type, usedAt: null },
    });

    await prisma.verificationCode.create({
      data: {
        identifier: target,
        code,
        type,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // 验证码不返回到响应体，开发模式通过 console 查看
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ResetCode] ${method} ${target}: ${code}`);
    }
    return NextResponse.json({
      success: true,
      message: method === 'phone' ? '验证码已发送' : '重置邮件已发送',
    });
  } catch (error) {
    console.error('Reset send error:', error);
    return NextResponse.json({ error: '发送验证码失败' }, { status: 500 });
  }
}
