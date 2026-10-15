/**
 * 计费轮次口径（chat/route 与 usage API 必须共用，保证实时显示与最终统计一致）
 *
 * 一次"有效计费轮次"= 一条成功生成的 assistant 回复（正常调用 AI 模型）。
 * 以下情况不计入用户购买/会员的轮次：
 * - 领域/隐私路由拦截、证据门禁：系统固定冷回复（modelUsed 见 NON_BILLED_MODELS）
 * - 无 API Key、AI 服务故障：没有 assistant 回复落库
 */
import { prisma } from '@/lib/prisma';
import { getMentorQuota } from '@/lib/plans';

const NON_BILLED_MODELS = ['mentor-router', 'mentor-evidence-gate'];

type DateFilter = { gte: Date } | { gt: Date };

/** 有效计费 assistant 消息的 Prisma where 片段 */
export function billedMessageWhere(userId: string, createdAt?: DateFilter) {
  return {
    role: 'assistant' as const,
    ...(createdAt ? { createdAt } : {}),
    modelUsed: { notIn: NON_BILLED_MODELS },
    chatSession: { userId },
  };
}

/** 有效计费 assistant 消息的 Prisma where 片段（单导师卡：只计绑定导师的会话） */
export function billedMessageWhereForMentor(
  userId: string,
  mentorId: string,
  createdAt?: DateFilter
) {
  return {
    role: 'assistant' as const,
    ...(createdAt ? { createdAt } : {}),
    modelUsed: { notIn: NON_BILLED_MODELS },
    chatSession: { userId, mentorId },
  };
}

/**
 * 计算一张有效订阅的剩余轮次（服务端专用）。
 * scope=SINGLE 时只计绑定导师名下的会话；quota 为 null（无限）时返回 Infinity。
 * 下单校验（切换互斥）与订阅页展示共用此口径。
 */
export async function getSubscriptionRoundsRemaining(sub: {
  userId: string;
  plan: string;
  scope: string;
  mentorId: string | null;
  startDate: Date;
}): Promise<number> {
  const quota = getMentorQuota(sub.plan);
  if (quota === null) return Number.POSITIVE_INFINITY;
  const where =
    sub.scope === 'SINGLE' && sub.mentorId
      ? billedMessageWhereForMentor(sub.userId, sub.mentorId, {
          gte: sub.startDate,
        })
      : billedMessageWhere(sub.userId, { gte: sub.startDate });
  const used = await prisma.chatMessage.count({ where });
  return Math.max(0, quota - used);
}
