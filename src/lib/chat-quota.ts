/**
 * 计费轮次口径（chat/route 与 usage API 必须共用，保证实时显示与最终统计一致）
 *
 * 一次"有效计费轮次"= 一条成功生成的 assistant 回复（正常调用 AI 模型）。
 * 以下情况不计入用户购买/会员的轮次：
 * - 领域/隐私路由拦截、证据门禁：系统固定冷回复（modelUsed 见 NON_BILLED_MODELS）
 * - 无 API Key、AI 服务故障：没有 assistant 回复落库
 */

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
