/**
 * 导师收益摊算（导师 dashboard 专用，on-the-fly 从 PAID 订单 + 计费消息重算）
 *
 * 单导师付费：金额按月平均（月卡/1、季卡/3、年卡/12），
 *   从支付日起每满一个自然月对日计提一次，累计已计提部分计入该导师收益。
 * 全导师付费：月摊额 × 当月该导师计费轮次 ÷ 该用户当月全部计费轮次，
 *   按每个计提月窗口逐月摊算；当月零轮次不计提。
 */
import { prisma } from '@/lib/prisma';
import {
  parseAnyPlanId,
  PLAN_DURATION_MONTHS,
  addMonthsDate,
  type AnyPlanId,
  type PlanId,
} from '@/lib/plans';

// 与 chat-quota 同一口径：冷回复不计费
const NON_BILLED_MODELS = ['mentor-router', 'mentor-evidence-gate'];

export interface MentorRevenue {
  single: {
    monthly: { users: number; amount: number };
    quarterly: { users: number; amount: number };
    yearly: { users: number; amount: number };
    totalAmount: number;
  };
  all: { totalAmount: number };
}

interface ParsedOrder {
  userId: string;
  amountYuan: number;
  paidAt: Date;
  months: number;
  scope: 'ALL' | 'SINGLE';
  basePlan: PlanId;
  mentorId: string | null;
}

/** 从支付日起已满的自然月对日次数（每满一次计提一份月摊额），封顶卡月数 */
function elapsedBilledMonths(start: Date, months: number, now: Date): number {
  let k = 0;
  while (k < months && addMonthsDate(start, k + 1) <= now) k++;
  return k;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function computeMentorRevenue(mentorId: string): Promise<MentorRevenue> {
  const now = new Date();

  // 全部已支付订阅订单（订单维度：续费/升级各自一单，金额不丢）
  const orders = await prisma.paymentOrder.findMany({
    where: { status: 'PAID', paymentType: 'SUBSCRIPTION' },
    select: { userId: true, amount: true, paidAt: true, metadata: true },
  });

  const parsed: ParsedOrder[] = [];
  for (const o of orders) {
    if (!o.paidAt) continue;
    let meta: { planId?: string; mentorId?: string } = {};
    try {
      meta = o.metadata ? JSON.parse(o.metadata) : {};
    } catch {
      continue;
    }
    const p = parseAnyPlanId(meta.planId || 'MONTHLY');
    if (!p) continue;
    parsed.push({
      userId: o.userId,
      amountYuan: Number(o.amount) || 0,
      paidAt: o.paidAt,
      months: PLAN_DURATION_MONTHS[(meta.planId as AnyPlanId) || 'MONTHLY'] ?? 1,
      scope: p.scope,
      basePlan: p.basePlan,
      mentorId: p.scope === 'SINGLE' ? (meta.mentorId ?? null) : null,
    });
  }

  // === 单导师付费：分卡种人数（去重）+ 已计提金额 ===
  const singleUsers: Record<PlanId, Set<string>> = {
    MONTHLY: new Set(),
    QUARTERLY: new Set(),
    YEARLY: new Set(),
  };
  const singleAmount: Record<PlanId, number> = { MONTHLY: 0, QUARTERLY: 0, YEARLY: 0 };

  for (const o of parsed) {
    if (o.scope !== 'SINGLE' || o.mentorId !== mentorId) continue;
    singleUsers[o.basePlan].add(o.userId);
    singleAmount[o.basePlan] +=
      (o.amountYuan / o.months) * elapsedBilledMonths(o.paidAt, o.months, now);
  }

  // === 全导师付费：按每个计提月窗口的轮次占比摊算 ===
  const allOrders = parsed.filter((o) => o.scope === 'ALL');
  let allTotal = 0;

  if (allOrders.length > 0) {
    const userIds = [...new Set(allOrders.map((o) => o.userId))];
    const minStart = new Date(Math.min(...allOrders.map((o) => o.paidAt.getTime())));

    // 一次性拉出相关用户的计费消息（含所属分身），内存中分桶到各计提月窗口
    const messages = await prisma.chatMessage.findMany({
      where: {
        role: 'assistant',
        createdAt: { gte: minStart, lte: now },
        modelUsed: { notIn: NON_BILLED_MODELS },
        chatSession: { userId: { in: userIds } },
      },
      select: {
        createdAt: true,
        chatSession: { select: { userId: true, mentorId: true } },
      },
    });

    const byUser = new Map<string, { t: number; mentorId: string }[]>();
    for (const m of messages) {
      const uid = m.chatSession.userId;
      const arr = byUser.get(uid) ?? [];
      arr.push({ t: m.createdAt.getTime(), mentorId: m.chatSession.mentorId });
      byUser.set(uid, arr);
    }

    for (const o of allOrders) {
      const k = elapsedBilledMonths(o.paidAt, o.months, now);
      if (k === 0) continue;
      const monthlyAmount = o.amountYuan / o.months;
      const msgs = byUser.get(o.userId) ?? [];
      for (let i = 1; i <= k; i++) {
        const wStart = addMonthsDate(o.paidAt, i - 1).getTime();
        const wEnd = addMonthsDate(o.paidAt, i).getTime();
        let total = 0;
        let mine = 0;
        for (const m of msgs) {
          if (m.t >= wStart && m.t < wEnd) {
            total++;
            if (m.mentorId === mentorId) mine++;
          }
        }
        if (total > 0) allTotal += (monthlyAmount * mine) / total;
      }
    }
  }

  const single = {
    monthly: { users: singleUsers.MONTHLY.size, amount: round2(singleAmount.MONTHLY) },
    quarterly: { users: singleUsers.QUARTERLY.size, amount: round2(singleAmount.QUARTERLY) },
    yearly: { users: singleUsers.YEARLY.size, amount: round2(singleAmount.YEARLY) },
    totalAmount: round2(singleAmount.MONTHLY + singleAmount.QUARTERLY + singleAmount.YEARLY),
  };

  return { single, all: { totalAmount: round2(allTotal) } };
}
