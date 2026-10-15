/**
 * 订阅计划配置 — PRD 8.1 B2C 会员订阅
 *
 * 两套付费方案（2026-10 调整）:
 * - 全导师付费（scope=ALL）: ¥38.8/月 · ¥98.8/季 · ¥328.8/年，解锁全部上线导师分身
 * - 单导师付费（scope=SINGLE）: ¥28.8/月 · ¥78.8/季 · ¥268.8/年，解锁选中导师分身
 *
 * 导师分身对话次数（两套方案同档一致）:
 * - 月度: 60轮次/订阅周期，每日最高 15 轮次
 * - 季度: 180轮次/订阅周期，每日最高 16 轮次
 * - 年度: 720轮次/订阅周期，每日最高 17 轮次
 *
 * 每日上限用于限制提取速率，防止个人蒸馏；总轮次为周期硬顶。
 */

export type PlanId = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type SinglePlanId = 'SINGLE_MONTHLY' | 'SINGLE_QUARTERLY' | 'SINGLE_YEARLY';
export type AnyPlanId = PlanId | SinglePlanId;
/** 订阅范围：ALL=全导师付费 | SINGLE=单导师付费 */
export type SubscriptionScope = 'ALL' | 'SINGLE';

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
  mentorQuota: number | null; // 导师分身对话总轮次上限（订阅周期内），null = 无限
  dailyQuota: number | null; // 导师分身每日最高轮次，null = 不限
  historyRetentionDays: number; // 对话历史保存天数，-1 = 永久
}

/** 单导师付费套餐：结构与全导师一致，id 带 SINGLE_ 前缀，basePlan 指向同档全导师套餐 */
export interface SingleMentorPlan extends Omit<SubscriptionPlan, 'id'> {
  id: SinglePlanId;
  basePlan: PlanId;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'MONTHLY',
    name: '月度会员',
    price: 38.8,
    priceFen: 3880,
    period: '/月',
    durationDays: 30,
    features: ['60轮次导师分身对话', '（最高）15轮次/天', '全部上线导师分身解锁'],
    popular: false,
    description: '',
    mentorQuota: 60,
    dailyQuota: 15,
    historyRetentionDays: 365,
  },
  {
    id: 'QUARTERLY',
    name: '季度会员',
    price: 98.8,
    priceFen: 9880,
    period: '/季',
    durationDays: 90,
    features: ['180次 AI 导师分身对话', '（最高）16轮次/天', '全部上线导师分身解锁', '优先体验新功能'],
    popular: true,
    description: '',
    mentorQuota: 180,
    dailyQuota: 16,
    historyRetentionDays: 365 * 3,
  },
  {
    id: 'YEARLY',
    name: '年度会员',
    price: 328.8,
    priceFen: 32880,
    period: '/年',
    durationDays: 365,
    features: [
      '720次 AI 导师分身对话',
      '（最高）17轮次/天',
      '全部上线导师分身解锁',
      '优先体验新功能',
      '优先参与线下各种活动',
    ],
    popular: false,
    description: '',
    mentorQuota: 720,
    dailyQuota: 17,
    historyRetentionDays: -1,
  },
];

export function getPlanById(id: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id);
}

/**
 * 单导师付费套餐 — 解锁选中导师分身
 * 轮次配额与全导师同档一致，仅解锁范围锁定一名导师
 */
export const SINGLE_MENTOR_PLANS: SingleMentorPlan[] = [
  {
    id: 'SINGLE_MONTHLY',
    basePlan: 'MONTHLY',
    name: '月度会员',
    price: 28.8,
    priceFen: 2880,
    period: '/月',
    durationDays: 30,
    features: ['60轮次导师分身对话', '（最高）15轮次/天', '解锁选中导师分身'],
    popular: false,
    description: '',
    mentorQuota: 60,
    dailyQuota: 15,
    historyRetentionDays: 365,
  },
  {
    id: 'SINGLE_QUARTERLY',
    basePlan: 'QUARTERLY',
    name: '季度会员',
    price: 78.8,
    priceFen: 7880,
    period: '/季',
    durationDays: 90,
    features: ['180次 AI 导师分身对话', '（最高）16轮次/天', '解锁选中导师分身', '优先体验新功能'],
    popular: true,
    description: '',
    mentorQuota: 180,
    dailyQuota: 16,
    historyRetentionDays: 365 * 3,
  },
  {
    id: 'SINGLE_YEARLY',
    basePlan: 'YEARLY',
    name: '年度会员',
    price: 268.8,
    priceFen: 26880,
    period: '/年',
    durationDays: 365,
    features: [
      '720次 AI 导师分身对话',
      '（最高）17轮次/天',
      '解锁选中导师分身',
      '优先体验新功能',
      '优先参与线下各种活动',
    ],
    popular: false,
    description: '',
    mentorQuota: 720,
    dailyQuota: 17,
    historyRetentionDays: -1,
  },
];

export function getSinglePlanById(id: string): SingleMentorPlan | undefined {
  return SINGLE_MENTOR_PLANS.find((p) => p.id === id);
}

/** 判断任意套餐 id 属于哪套方案，并给出同档基础套餐 */
export function parseAnyPlanId(
  id: string
): { scope: SubscriptionScope; basePlan: PlanId } | null {
  if (getPlanById(id)) return { scope: 'ALL', basePlan: id as PlanId };
  const single = getSinglePlanById(id);
  if (single) return { scope: 'SINGLE', basePlan: single.basePlan };
  return null;
}

/**
 * 多榨卡 — 消耗品，不是时间订阅
 * 会员/非会员均可购买；不授予会员身份、不过期、用完再续。
 */
type CreditPackId = 'CREDIT_10';

export interface CreditPack {
  id: CreditPackId;
  name: string;
  price: number; // 单位: 元
  priceFen: number; // 单位: 分
  credits: number; // 包含的导师分身对话轮次
  description: string;
  features: string[];
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'CREDIT_10',
    name: '10轮次',
    price: 19.9,
    priceFen: 1990,
    credits: 10,
    description: '多榨几轮，以备不时之需',
    features: ['10个轮次，用完再续'],
  },
];

export function getCreditPackById(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/** 多榨卡单笔订单数量上限 */
export const CREDIT_PACK_MAX_QTY = 99;

/**
 * 多榨卡余额累计上限（轮次）：当前持有余额 + 本次购买轮次 ≤ 2970（297 包）。
 * 超过即"榨干"：支付按钮失活，卡顶红标提示，消耗回落后自动恢复。
 */
export const CREDIT_PACK_MAX_BALANCE = 2970;

/**
 * 多榨卡批量折扣（按整单数量）：
 * - 1-4 个：原价
 * - 5-9 个：9 折
 * - 10 个及以上：8.5 折
 */
export function getCreditPackDiscount(qty: number): { rate: number; label: string | null } {
  if (qty >= 10) return { rate: 0.85, label: '8.5折' };
  if (qty >= 5) return { rate: 0.9, label: '9折' };
  return { rate: 1, label: null };
}

/**
 * 多榨卡订单总价（单位：分）。服务端下单与前端展示必须共用此函数。
 * 折后总价向下取整到角（1 位小数）：
 *   ￥19.9 × 5 × 0.9 = ￥89.55 → ￥89.5（8950 分）
 *   ￥19.9 × 10 × 0.85 = ￥169.15 → ￥169.1（16910 分）
 * 无折扣时单价本身为整数角，取整不改变结果。
 */
export function calcCreditPackPriceFen(pack: CreditPack, qty: number): number {
  const safeQty = Math.max(1, Math.min(CREDIT_PACK_MAX_QTY, Math.trunc(qty)));
  const { rate } = getCreditPackDiscount(safeQty);
  const rawFen = Math.round(pack.priceFen * safeQty * rate);
  return rate < 1 ? Math.floor(rawFen / 10) * 10 : rawFen;
}

/** 分 → 页面展示的元字符串，固定保留 1 位小数（1990 → "19.9"，8900 → "89.0"） */
export function formatPriceFen(fen: number): string {
  return (fen / 100).toFixed(1);
}

/** 各订阅套餐对应的自然月数（升级/续费按自然月对日叠加）；单导师与全导师同档一致 */
export const PLAN_DURATION_MONTHS: Record<AnyPlanId, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  SINGLE_MONTHLY: 1,
  SINGLE_QUARTERLY: 3,
  SINGLE_YEARLY: 12,
};

/**
 * 年卡续费上限（天）：来自年卡的剩余天数 ≤ 1460（365×4）时才可再续一年。
 * 正好剩 1460 天可续（续后 1825 天）；超过 1460 天必须等消耗回落至 ≤1460 天。
 */
export const YEARLY_RENEWAL_CAP_DAYS = 365 * 4;

/**
 * 自然月对日加法：10/14 + 3 个月 → 次年 1/14。
 * 起始日为月末（如 1/31）且目标月天数不足时，落在目标月最后一天。
 */
export function addMonthsDate(base: Date, months: number): Date {
  const d = new Date(base);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * 根据套餐 ID 获取导师分身对话总轮次上限（兼容单导师套餐 id）
 */
export function getMentorQuota(planId: string): number | null {
  const plan = getPlanById(planId) ?? getSinglePlanById(planId);
  return plan?.mentorQuota ?? null;
}

/**
 * 根据套餐 ID 获取导师分身每日最高轮次（兼容单导师套餐 id）
 */
export function getMentorDailyQuota(planId: string): number | null {
  const plan = getPlanById(planId) ?? getSinglePlanById(planId);
  return plan?.dailyQuota ?? null;
}
