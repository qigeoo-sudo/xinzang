/**
 * 重置密码 API
 * POST /api/auth/reset-password
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { z } from 'zod';

const schema = z.object({
  method: z.enum(['phone', 'email']),
  target: z.string().min(1),
  code: z.string().min(1, '请输入验证码'),
  newPassword: z
    .string()
    .min(8, '密码至少需要8位字符')
    .regex(/^[a-zA-Z0-9]+$/, '密码只能包含字母或数字'),
});

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateCheck = rateLimit(`reset-pwd:${clientIP}`, 5, 60 * 1000);
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

    const { method, target, code, newPassword } = parsed.data;

    // 密码强度校验
    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return NextResponse.json({ error: strengthCheck.message }, { status: 400 });
    }

    // 验证码校验
    const codeType = method === 'phone' ? 'PHONE_LOGIN' : 'EMAIL_LOGIN';
    const verificationRecord = await prisma.verificationCode.findFirst({
      where: {
        identifier: target,
        type: codeType,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      return NextResponse.json({ error: '验证码已过期，请重新获取' }, { status: 400 });
    }

    if (code !== verificationRecord.code) {
      await prisma.verificationCode.update({
        where: { id: verificationRecord.id },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ error: '验证码不正确' }, { status: 400 });
    }

    // 查找用户
    let user;
    if (method === 'phone') {
      user = await prisma.user.findUnique({ where: { phone: target } });
    } else {
      user = await prisma.user.findUnique({ where: { email: target.toLowerCase() } });
    }

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 更新密码
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // 标记验证码已使用
    await prisma.verificationCode.update({
      where: { id: verificationRecord.id },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({ success: true, message: '密码重置成功' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: '重置密码失败' }, { status: 500 });
  }
}
