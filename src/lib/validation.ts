/**
 * 输入校验 Schema — 修复安全审计 A03 注入风险
 * 所有用户输入通过 Zod 校验后再处理
 */
import { z } from 'zod';

// 聊天消息 Schema — P0-3 安全修订: 只接收单条消息，不接收 messages 数组
export const chatMessageSchema = z.object({
  mentorId: z.string().min(1).max(50),
  message: z.string().min(1, '消息不能为空').max(4000, '单条消息不能超过4000字'),
  sessionId: z.string().optional(),
});
