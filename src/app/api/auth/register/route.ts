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
import {
  registerProfileSchema,
  assessmentSchema,
  toUserProfileData,
  toAssessmentCreate,
} from '@/lib/register-v2';
import { containsProfanity } from '@/lib/profanity';
import { readAttribution, resolveActiveChannel } from '@/lib/attribution';
import { z } from 'zod';

const registerSchema = z.object({
  method: z.enum(['phone', 'email']),
  target: z.string().min(1, '请输入手机号或邮箱'),
  password: z
    .string()
    .min(8, '密码至少需要8位字符')
    .max(64, '密码不能超过64位字符')
    .regex(/^(?=.*[a-zA-Z])(?=.*[0-9])/, '密码必须包含字母和数字'),
  code: z.string().optional(),
  // register-v2 三步注册的档案与职业兴趣测评（均可选，兼容旧注册页）
  // contactEmail 已在 registerProfileSchema 内（独立于 User.email 登录邮箱）
  profile: registerProfileSchema.optional(),
  assessment: assessmentSchema.optional(),
  // 渠道首次触点快照（由落地页组件写入 cookie/localStorage，仅用于注册盖章）
  attribution: z
    .object({
      ch: z.string().trim().min(1).max(64).optional(),
      source: z.string().max(300).optional(),
      medium: z.string().max(300).optional(),
      campaign: z.string().max(300).optional(),
      term: z.string().max(300).optional(),
      content: z.string().max(300).optional(),
      landing: z.string().max(300).optional(),
      ts: z.string().max(64).optional(),
    })
    .passthrough()
    .optional(),
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

    const { method, target, password, code, profile, assessment } = parsed.data;

    // 3. 密码强度校验
    const strengthCheck = validatePasswordStrength(password);
    if (!strengthCheck.valid) {
      return NextResponse.json(
        { error: strengthCheck.message },
        { status: 400 }
      );
    }

    // 3.5 昵称不文明用语校验（早期拦截，不消耗验证码；命中词只进服务端日志）
    if (profile?.nickname && containsProfanity(profile.nickname)) {
      console.warn('[profanity] register nickname blocked, length =', profile.nickname.length);
      return NextResponse.json(
        { error: '昵称含不文明用语，请修改后再提交', field: 'nickname' },
        { status: 400 }
      );
    }

    // 学校名称不文明用语校验（学校不在名单里时保留用户输入，此处做硬校验兜底）
    if (profile?.school && containsProfanity(profile.school)) {
      console.warn('[profanity] register school blocked, length =', profile.school.length);
      return NextResponse.json(
        { error: '学校名称含不文明用语，请修改后再提交', field: 'school' },
        { status: 400 }
      );
    }

    // “让导师分身更懂你”选填区文本不文明用语校验（焦虑自述 + 帮助方面“其他”原文）
    if (profile?.careerAnxiety && containsProfanity(profile.careerAnxiety)) {
      console.warn('[profanity] register careerAnxiety blocked, length =', profile.careerAnxiety.length);
      return NextResponse.json(
        { error: '内容含不文明用语，请修改后再提交', field: 'careerAnxiety' },
        { status: 400 }
      );
    }
    if (profile?.helpPriority?.some((v) => v && containsProfanity(v))) {
      console.warn('[profanity] register helpPriority blocked');
      return NextResponse.json(
        { error: '内容含不文明用语，请修改后再提交', field: 'helpPriority' },
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
      // 原子操作增加尝试次数，防止并发绕过
      const result = await prisma.verificationCode.updateMany({
        where: { id: verificationRecord.id, attempts: { lt: verificationRecord.maxAttempts } },
        data: { attempts: { increment: 1 } },
      });
      if (result.count === 0) {
        return NextResponse.json(
          { error: '验证码尝试次数过多，请重新获取' },
          { status: 400 }
        );
      }
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

    // 8. 创建用户 + 用户档案（register-v2 携带档案与测评时一并落库）
    // 选填联系邮箱在 registerProfileSchema 内，由 toUserProfileData 映射到 UserProfile.contactEmail
    // （独立于 User.email 登录邮箱；将来启用 email 注册时，可引导用户在档案页升级 contactEmail）
    const now = new Date();
    const profileData = profile
      ? {
          ...toUserProfileData(profile),
          registrationCompletedAt: now,
        }
      : {};

    const userData: any = {
      passwordHash,
      freeTrialUsed: 0,
      emailVerified: method === 'email' ? now : null,
      profile: { create: profileData },
    };

    if (assessment) {
      userData.interestAssessment = {
        create: toAssessmentCreate(assessment),
      };
    }

    if (method === 'phone') {
      userData.phone = target;
      userData.name = `用户${target.slice(-4)}`;
    } else {
      userData.email = target.toLowerCase();
      userData.name = target.split('@')[0];
    }

    // 渠道归因盖章：首次触点锁定，仅当渠道码有效且渠道 ACTIVE 时写入。
    // 任何归因异常都不阻断注册（按自然量落库）。
    try {
      const snapshot = readAttribution(request, parsed.data.attribution);
      const channel = await resolveActiveChannel(snapshot?.ch);
      if (snapshot && channel) {
        userData.channelId = channel.id;
        userData.attributionJson = JSON.stringify({ ...snapshot, ch: channel.code });
      }
    } catch (attrError) {
      console.warn(
        '[attribution] stamp skipped:',
        attrError instanceof Error ? attrError.message : attrError,
      );
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
