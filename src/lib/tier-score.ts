/**
 * 导师 SABC 评分引擎（纯函数，不依赖 DB / Next）
 *
 * 评分基数：评分周期内按导师归集的「订阅确认收入」逐日累计——
 *   当日确认收入 = 当日有效月卡数 × 月卡售价/30.5
 *               + 当日有效季卡数 × 季卡售价/91.5
 *               + 当日有效年卡数 × 年卡售价/366
 *               + 1.99 × 当日加榨包实际消耗轮次
 * - 有效卡 = 当天处于 [startDate, endDate) 存续区间内（新增当日计、到期当日不计）
 * - 加榨包购买金额一律不计入，只计实际消耗（1.99 元/轮 = 19.9 元/10 轮包的单轮价）
 * - 卡售价取该卡实际支付额（折扣/改价不影响其他卡），按自然日常数线性摊销
 *
 * 分档：周期末按累计金额降序排名（共 N 位导师）——
 *   排名前 5% 为 S，其后到前 20% 为 A，其后到前 50% 为 B，其余为 C。
 *   N=20 时即 1/3/6/10。归因失败（归「其他」）的金额不参与分档。
 *
 * 付费导师归因（attributePaymentMentor），按优先级逐级验证：
 *   0. 渠道来自导师验证：用户首次触点渠道的合作方（Channel.partner）精确匹配导师英文名
 *      （Mentor.name，大小写+空格全匹配）→ 直接归该导师，优先级最高，无需行为验证；
 *      调用方在付费时反查 User.channelId → Channel.partner → Mentor.name 得到 channelMentorId 传入；
 *   1. 付费前最后一次对话的导师，与付费后第一个聊天的导师一致 → 归该导师；
 *   2. 不一致 → 沿付费前对话记录从后向前回溯，找到与「付费后首个对话导师」一致的 → 归该导师；
 *   3. 仍找不到 → 沿付费前导师分身主页浏览记录从后向前回溯找一致；
 *   4. 都不一致（含付费后再未聊天）→ 归 null（「其他」池，不参与导师分档）。
 */

export type Tier = 'S' | 'A' | 'B' | 'C';
export type PlanKind = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/** 各套餐日摊销分母（自然日常数；注意不是套餐 durationDays 的 30/90/365） */
export const AMORT_DAYS: Record<PlanKind, number> = {
  MONTHLY: 30.5,
  QUARTERLY: 91.5,
  YEARLY: 366,
};

/** 加榨包单轮确认收入（元/轮） */
export const CREDIT_PACK_UNIT_YUAN = 1.99;

/** 分档百分位 cutoff（累计排名比例） */
const TIER_CUTOFF: { tier: Tier; pct: number }[] = [
  { tier: 'S', pct: 0.05 },
  { tier: 'A', pct: 0.2 },
  { tier: 'B', pct: 0.5 },
];

/** 已归因的订阅卡：mentorId=null 表示归因失败，金额进「其他」池 */
export interface AttributedCard {
  plan: PlanKind;
  paidAmount: number; // 该卡实际支付金额（元）
  startDate: string; // YYYY-MM-DD，含当日
  endDate: string; // YYYY-MM-DD，不含当日（到期日当天停止摊销）
  mentorId: string | null;
}

/** 加榨包消耗（购买不记分，消耗才记分；消耗时天然带对话导师） */
export interface CreditPackUse {
  date: string; // YYYY-MM-DD
  mentorId: string;
  rounds: number;
}

/** 评分周期（北京日，闭区间） */
export interface ScorePeriod {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export interface MentorScore {
  mentorId: string;
  amount: number;
}

export interface ScoreResult {
  /** 各导师评分金额（元，2 位小数） */
  byMentor: Map<string, number>;
  /** 归因失败的订阅卡金额（不参与分档） */
  otherAmount: number;
  /** 加榨包消耗金额合计（含在 byMentor 内，单列便于核对） */
  creditPackAmount: number;
}

function dayDiff(fromInclusive: string, toExclusive: string): number {
  const a = new Date(`${fromInclusive}T00:00:00Z`).getTime();
  const b = new Date(`${toExclusive}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function later(a: string, b: string): string {
  return a >= b ? a : b;
}
function earlier(a: string, b: string): string {
  return a <= b ? a : b;
}

/** 两张 [from, to) 日区间的交集天数（from 含、to 不含），无交集为 0 */
export function overlapDays(fromA: string, toAExcl: string, fromB: string, toBExcl: string): number {
  const lo = later(fromA, fromB);
  const hi = earlier(toAExcl, toBExcl);
  return Math.max(0, dayDiff(lo, hi));
}

/**
 * 计算周期内各导师的订阅确认收入 + 加榨包消耗收入。
 * 卡摊销 = 实际支付额 / 摊销天数 × 与评分周期的交集天数。
 */
export function scoreMentors(
  period: ScorePeriod,
  cards: AttributedCard[],
  creditUses: CreditPackUse[],
): ScoreResult {
  const byMentor = new Map<string, number>();
  let otherAmount = 0;
  let creditPackAmount = 0;

  const add = (mentorId: string | null, amount: number) => {
    if (amount === 0) return;
    if (mentorId === null) {
      otherAmount += amount;
      return;
    }
    byMentor.set(mentorId, (byMentor.get(mentorId) ?? 0) + amount);
  };

  for (const card of cards) {
    const days = overlapDays(period.start, dayAfter(period.end), card.startDate, card.endDate);
    if (days === 0) continue;
    const amount = (card.paidAmount / AMORT_DAYS[card.plan]) * days;
    add(card.mentorId, amount);
  }

  for (const use of creditUses) {
    if (use.date < period.start || use.date > period.end || use.rounds <= 0) continue;
    const amount = CREDIT_PACK_UNIT_YUAN * use.rounds;
    add(use.mentorId, amount);
    creditPackAmount += amount;
  }

  const rounded = new Map<string, number>();
  for (const [id, amount] of byMentor) rounded.set(id, round2(amount));
  return { byMentor: rounded, otherAmount: round2(otherAmount), creditPackAmount: round2(creditPackAmount) };
}

/**
 * 按评分金额降序分档。同分按 mentorId 字典序稳定排列（真实业务若需并列，
 * 应在调用前合并并列名次）。cutoff 名次 = round(N × 比例)。
 */
export function assignTiers(byMentor: Map<string, number>): Map<string, Tier> {
  const ordered = [...byMentor.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const n = ordered.length;
  const result = new Map<string, Tier>();
  ordered.forEach(([id], i) => {
    const rank = i + 1;
    let tier: Tier = 'C';
    for (const cut of TIER_CUTOFF) {
      if (rank <= Math.round(n * cut.pct)) {
        tier = cut.tier;
        break;
      }
    }
    result.set(id, tier);
  });
  return result;
}

export interface AttributionEvent {
  mentorId: string;
  ts: number; // 毫秒时间戳，仅用于表达先后，引擎内部只认数组顺序
}

export interface AttributionInput {
  /** 渠道归因的导师 ID（Channel.partner 精确匹配 Mentor.name 得到）；非空时直接归属，优先级最高 */
  channelMentorId?: string | null;
  /** 付费前与各分身的对话，时间升序 */
  chatsBefore: AttributionEvent[];
  /** 付费后第一个聊天的分身；付费后未再聊天为 null（无法验证 → 其他） */
  firstChatAfterMentor: string | null;
  /** 付费前分身主页浏览记录，时间升序（对话记录找不到一致时兜底） */
  profileViewsBefore?: AttributionEvent[];
}

/** 付费导师归因，返回 null 表示归因失败（金额入「其他」池） */
export function attributePaymentMentor(input: AttributionInput): string | null {
  // 0. 渠道来自导师验证：最强信号，直接归属
  if (input.channelMentorId) return input.channelMentorId;

  const after = input.firstChatAfterMentor;
  if (!after) return null;

  const lastBefore = input.chatsBefore[input.chatsBefore.length - 1]?.mentorId;
  if (lastBefore === after) return after;

  // 付费前对话从后向前回溯
  for (let i = input.chatsBefore.length - 2; i >= 0; i--) {
    if (input.chatsBefore[i].mentorId === after) return after;
  }

  // 付费前主页浏览从后向前回溯
  const views = input.profileViewsBefore ?? [];
  for (let i = views.length - 1; i >= 0; i--) {
    if (views[i].mentorId === after) return after;
  }

  return null;
}

function dayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
