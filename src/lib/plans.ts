/**
 * 订阅计划配置 — PRD 8.1 B2C 会员订阅
 *
 * 定价策略:
 * - 月度: ¥29.9/月
 * - 季度: ¥79.9/季 (省10%)
 * - 年度: ¥269.9/年 (省25%)
 *
 * 导师分身对话次数:
 * - 月度: 60次/订阅周期
 * - 季度: 200次/订阅周期
 * - 年度: 无限次
 */

export type PlanId = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  price: number; // 单位: 元
  priceFen: number; // 单位: 分 (微信支付要求)
  period: string;
  durationDays: number;
  features: string[];
  popular: boolean;
  description: string;
  mentorQuota: number | null; // 导师分身对话次数上限，null = 无限
  historyRetentionDays: number; // 对话历史保存天数，-1 = 永久
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'MONTHLY',
    name: '月度会员',
    price: 29.9,
    priceFen: 2990,
    period: '/月',
    durationDays: 30,
    features: ['60次 AI 导师分身对话', '全部上线导师分身解锁', '对话历史云端保存1年'],
    popular: false,
    description: '适合短期体验，随时可取消',
    mentorQuota: 60,
    historyRetentionDays: 365,
  },
  {
    id: 'QUARTERLY',
    name: '季度会员',
    price: 79.9,
    priceFen: 7990,
    period: '/季',
    durationDays: 90,
    features: ['200次 AI 导师分身对话', '全部上线导师分身解锁', '对话历史云端保存3年', '优先体验新功能'],
    popular: true,
    description: '最受欢迎的选择，性价比最高',
    mentorQuota: 200,
    historyRetentionDays: 365 * 3,
  },
  {
    id: 'YEARLY',
    name: '年度会员',
    price: 269.9,
    priceFen: 26990,
    period: '/年',
    durationDays: 365,
    features: ['无限次 AI 导师分身对话', '全部上线导师分身解锁', '对话历史云端永久保存', '优先体验新功能', '优先开放新导师分身'],
    popular: false,
    description: '长期陪伴，享受最低价格',
    mentorQuota: null,
    historyRetentionDays: -1,
  },
];

export function getPlanById(id: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id);
}

/**
 * 根据套餐 ID 获取导师分身对话次数上限
 */
export function getMentorQuota(planId: string): number | null {
  const plan = getPlanById(planId);
  return plan?.mentorQuota ?? null;
}
