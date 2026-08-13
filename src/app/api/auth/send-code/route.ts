/**
 * 发送验证码 API (Mock)
 * POST /api/auth/send-code
 *
 * 功能:
 * - 手机注册: 发送短信验证码 (当前 mock，返回验证码)
 * - 邮箱注册: 发送验证邮件 (当前 mock，返回验证码)
 *
 * 生产环境替换为真实短信/邮件服务
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { z } from 'zod';

const sendCodeSchema = z.object({
  method: z.enum(['phone', 'email']),
  target: z.string().min(1, '请输入手机号或邮箱'),
});

export async function POST(request: NextRequest) {
  try {
    // 速率限制
    const clientIP = getClientIP(request);
    const rateCheck = rateLimit(`send-code:${clientIP}`, 5, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const body = await request.json();
    const parsed = sendCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const { method, target } = parsed.data;
    const type = method === 'phone' ? 'PHONE_REGISTER' : 'EMAIL_REGISTER';

    // 校验格式
    if (method === 'phone') {
      if (!/^1[3-9]\d{9}$/.test(target)) {
        return NextResponse.json({ error: '请输入有效的手机号码' }, { status: 400 });
      }

      // 检查手机号是否已注册
      const existing = await prisma.user.findUnique({ where: { phone: target } });
      if (existing) {
        return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 });
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
        return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
      }

      const existing = await prisma.user.findUnique({ where: { email: target.toLowerCase() } });
      if (existing) {
        return NextResponse.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 });
      }
    }

    // Mock: 生成6位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 删除该 identifier+type 的旧验证码，再创建新的
    await prisma.verificationCode.deleteMany({
      where: { identifier: target, type, usedAt: null },
    });

    await prisma.verificationCode.create({
      data: {
        identifier: target,
        code,
        type,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10分钟有效期
      },
    });

    // Mock 模式: 直接返回验证码 (生产环境不返回)
    return NextResponse.json({
      success: true,
      message: method === 'phone' ? '短信验证码已发送' : '验证邮件已发送',
      code, // Mock: 生产环境删除此行
    });
  } catch (error) {
    console.error('Send code error:', error);
    return NextResponse.json({ error: '发送验证码失败' }, { status: 500 });
  }
}
