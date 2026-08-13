/**
 * 注册 API — 支持手机/邮箱注册
 * POST /api/auth/register
 *
 * 功能:
 * - 手机注册: 手机号 + 密码 + 验证码
 * - 邮箱注册: 邮箱 + 密码 + 验证码
 * - bcrypt 密码哈希存储
 * - 速率限制 (防暴力注册)
 * - 输入校验 (Zod)
 * - 注册成功后自动创建 UserProfile
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { z } from 'zod';

const registerSchema = z.object({
  method: z.enum(['phone', 'email']),
  target: z.string().min(1, '请输入手机号或邮箱'),
  password: z
    .string()
    .min(8, '密码至少需要8位字符')
    .regex(/^[a-zA-Z0-9]+$/, '密码只能包含字母或数字'),
  code: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. 速率限制
    const clientIP = getClientIP(request);
    const rateCheck = rateLimit(`register:${clientIP}`, 5, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // 2. 解析请求体
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const { method, target, password, code } = parsed.data;

    // 3. 密码强度校验
    const strengthCheck = validatePasswordStrength(password);
    if (!strengthCheck.valid) {
      return NextResponse.json(
        { error: strengthCheck.message },
        { status: 400 }
      );
    }

    // 4. 验证码校验
    const codeType = method === 'phone' ? 'PHONE_REGISTER' : 'EMAIL_REGISTER';
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
      return NextResponse.json(
        { error: '验证码已过期，请重新获取' },
        { status: 400 }
      );
    }

    if (verificationRecord.attempts >= verificationRecord.maxAttempts) {
      return NextResponse.json(
        { error: '验证码尝试次数过多，请重新获取' },
        { status: 400 }
      );
    }

    if (code !== verificationRecord.code) {
      // 增加尝试次数
      await prisma.verificationCode.update({
        where: { id: verificationRecord.id },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json(
        { error: '验证码不正确' },
        { status: 400 }
      );
    }

    // 5. 检查是否已注册
    if (method === 'phone') {
      if (!/^1[3-9]\d{9}$/.test(target)) {
        return NextResponse.json({ error: '请输入有效的手机号码' }, { status: 400 });
      }
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

    // 6. 哈希密码
    const passwordHash = await hashPassword(password);

    // 7. 标记验证码已使用
    await prisma.verificationCode.update({
      where: { id: verificationRecord.id },
      data: { usedAt: new Date() },
    });

    // 8. 创建用户 + 用户档案
    const userData: any = {
      passwordHash,
      freeTrialUsed: 0,
      profile: { create: {} },
    };

    if (method === 'phone') {
      userData.phone = target;
      userData.email = null;
      userData.name = `用户${target.slice(-4)}`;
    } else {
      userData.email = target.toLowerCase();
      userData.name = target.split('@')[0];
    }

    const user = await prisma.user.create({
      data: userData,
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        createdAt: true,
      },
    });

    // 9. 返回成功
    return NextResponse.json(
      {
        success: true,
        message: '注册成功',
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: '注册失败，请稍后再试' },
      { status: 500 }
    );
  }
}
