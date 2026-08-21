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
    .regex(/^[a-zA-Z0-9]+$/, '密码只能包含字母或数字'),
  name: z
    .string()
    .min(1, '请输入昵称')
    .max(30, '昵称最多30个字符')
    .optional(),
});

// 登录 Schema
export const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '密码不能为空'),
});

// 用户档案更新 Schema
export const updateProfileSchema = z.object({
  school: z.string().max(100).optional(),
  major: z.string().max(100).optional(),
  enrollmentYear: z.string().max(50).optional(),
  interests: z.array(z.string().max(50)).max(10).optional(),
  goals: z.string().max(500).optional(),
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
