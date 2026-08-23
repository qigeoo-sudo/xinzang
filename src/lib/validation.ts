/**
 * 输入校验 Schema — 修复安全审计 A03 注入风险
 * 所有用户输入通过 Zod 校验后再处理
 */
import { z } from 'zod';

// 注册 Schema
export const registerSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z
    .string()
    .min(8, '密码至少需要8位字符')
    .max(64, '密码不能超过64位字符')
    .regex(/^(?=.*[a-zA-Z])(?=.*[0-9])/, '密码必须包含字母和数字'),
  name: z
    .string()
    .min(1, '请输入昵称')
    .max(30, '昵称最多30个字符')
    .optional(),
});

// 登录 Schema — 支持手机号或邮箱
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, '请输入手机号或邮箱')
    .refine(
      (val) => /^1[3-9]\d{9}$/.test(val) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      '请输入有效的手机号或邮箱'
    ),
  password: z.string().min(1, '密码不能为空'),
});

// Defense-in-depth XSS 过滤 — React 已自动转义 HTML，此函数作为额外防线
function sanitizeText(val: string): string {
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

// 用户档案更新 Schema
export const updateProfileSchema = z.object({
  school: z.string().max(100).transform(sanitizeText).optional(),
  major: z.string().max(100).transform(sanitizeText).optional(),
  enrollmentYear: z.string().max(50).transform(sanitizeText).optional(),
  interests: z.array(z.string().max(50).transform(sanitizeText)).max(10).optional(),
  goals: z.string().max(500).transform(sanitizeText).optional(),
});

// 聊天消息 Schema — P0-3 安全修订: 只接收单条消息，不接收 messages 数组
export const chatMessageSchema = z.object({
  mentorId: z.string().min(1).max(50),
  message: z.string().min(1, '消息不能为空').max(4000, '单条消息不能超过4000字'),
  sessionId: z.string().optional(),
});

// 创建订单 Schema
export const createOrderSchema = z.object({
  plan: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  paymentMethod: z.enum(['wechat', 'alipay']),
});

// 创建聊天会话 Schema
export const createChatSessionSchema = z.object({
  mentorId: z.string().min(1).max(50),
  title: z.string().max(100).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
