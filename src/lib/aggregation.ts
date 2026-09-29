/**
 * 每日汇总聚合引擎 — 把原始事件与业务表算成看板直接可读的聚合结果。
 * 对应操作手册第 13（分身指标）、15（漏斗）、16（旅程）章。
 *
 * 口径铁律：
 * - 统计按北京时间（UTC+8）归日
 * - 可重复执行：同一日期同一 aggregationVersion 的旧结果先整体删除再写入
 * - 计算实现变更时升级 AGG_VERSION，并在手册记录重算范围
 * - 身份排除：非 NORMAL 群组账号不进自然用户口径（历史群组匹配见 UserGroupHistory）
 */
import { prisma } from '@/lib/prisma';
import { mentors } from '@/lib/mentors';
import { fetchWithRetry } from '@/lib/ai-retry';

export const AGG_VERSION = 'v1';
const BJ_OFFSET = 8 * 3600_000;
const DAY_MS = 24 * 3600_000;

// ==================== 权益来源判定 ====================

/** 订阅档位盖章值（月/季/年） */
export const SUBSCRIPTION_TIER_SOURCES = [
  'SUBSCRIPTION_MONTHLY',
  'SUBSCRIPTION_QUARTERLY',
  'SUBSCRIPTION_YEARLY',
] as const;

/** 是否订阅类来源（含历史无档位 SUBSCRIPTION） */
export function isSubscriptionSource(src: string | null | undefined): boolean {
  return !!src && (src === 'SUBSCRIPTION' || src.startsWith('SUBSCRIPTION_'));
}

/** 是否完成问答轮（消耗任一权益：免费试用 / 订阅 / 加榨包） */
export function isCompletedSource(src: string | null | undefined): boolean {
  return src === 'FREE_TRIAL' || src === 'CREDIT_PACK' || isSubscriptionSource(src);
}

// ==================== 时间工具（北京时间） ====================

/** 任意时刻所属北京日的零点（UTC 时刻） */
export function beijingDayStart(input: Date): Date {
  const bj = new Date(input.getTime() + BJ_OFFSET);
  const startUtc = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate());
  return new Date(startUtc - BJ_OFFSET);
}

function beijingDayKey(input: Date): string {
  const bj = new Date(input.getTime() + BJ_OFFSET);
  return bj.toISOString().slice(0, 10);
}

/** 北京日所在周的周一零点 */
function beijingWeekStart(input: Date): Date {
  const dayStart = beijingDayStart(input);
  const bj = new Date(dayStart.getTime() + BJ_OFFSET);
  const dow = bj.getUTCDay(); // 0=日
  const diff = dow === 0 ? 6 : dow - 1;
  return new Date(dayStart.getTime() - diff * DAY_MS);
}

// ==================== UA 解析 ====================

type DeviceType = 'ios' | 'android' | 'desktop' | 'other';

function parseDevice(ua: string | null | undefined): DeviceType {
  if (!ua) return 'other';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows Phone|IEMobile/i.test(ua)) return 'other';
  if (/Windows|Macintosh|Mac OS X|CrOS|Linux/i.test(ua)) return 'desktop';
  return 'other';
}

const BOT_RE =
  /bot|crawl|spider|slurp|baidu|googlebot|bingpreview|facebookexternalhit|embedly|quora|pinterest|telegram|whatsapp|preview/i;

function isBot(ua: string | null | undefined): boolean {
  return !!ua && BOT_RE.test(ua);
}

// ==================== 通用工具 ====================

type CountMap = Record<string, number>;

function addTo(map: CountMap, key: string, n = 1): void {
  map[key] = (map[key] ?? 0) + n;
}

function topN(map: CountMap, n: number): [string, number][] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function safeParseProps(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function safeParseJson(raw: string | null | undefined): Record<string, unknown> {
  return safeParseProps(raw ?? null);
}

// ==================== 焦虑归类（LLM） ====================

interface AnxietyCategory {
  category: string;
  count: number;
}

/**
 * 调 LLM 对职业焦虑自由文本归并类别，返回类别与条数（降序）。
 * 未配置 key 或调用失败时返回 null，不阻断聚合主流程。
 */
async function categorizeAnxieties(texts: string[]): Promise<AnxietyCategory[] | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';

  const numbered = texts.map((t, i) => `${i + 1}. ${t.slice(0, 300)}`).join('\n');

  try {
    const res = await fetchWithRetry(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是职业咨询分析师。把用户的职业焦虑原话归并为若干互斥类别，类别名 4-10 字，不要编造原话没有的类别。只返回 JSON：{"categories":[{"category":"类别名","count":数字}]}，按 count 降序。',
          },
          { role: 'user', content: numbered },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const cats = JSON.parse(content)?.categories;
    if (!Array.isArray(cats)) return null;
    return cats
      .filter(
        (c: unknown) =>
          !!c &&
          typeof (c as AnxietyCategory).category === 'string' &&
          typeof (c as AnxietyCategory).count === 'number',
      )
      .map((c: AnxietyCategory) => ({
        category: c.category,
        count: Number(c.count),
      }));
  } catch {
    return null;
  }
}

// ==================== 主入口 ====================

export interface AggregationReport {
  date: string;
  platformRows: number;
  mentorRows: number;
  journeyRows: number;
  version: string;
}

export async function runDailyAggregation(opts: { date?: Date } = {}): Promise<AggregationReport> {
  const now = new Date();
  const dayStart = beijingDayStart(opts.date ?? now);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const inWindow = (t: Date) => t >= dayStart && t < dayEnd;

  // ---------- 幂等：清掉本日同版本旧结果 ----------
  await prisma.dailyPlatformStats.deleteMany({
    where: { date: dayStart, aggregationVersion: AGG_VERSION },
  });
  await prisma.dailyMentorStats.deleteMany({
    where: { date: dayStart, aggregationVersion: AGG_VERSION },
  });
  await prisma.dailyJourneyStats.deleteMany({
    where: { date: dayStart, aggregationVersion: AGG_VERSION },
  });

  // ---------- 基础数据 ----------
  const users = await prisma.user.findMany({
    select: {
      id: true,
      role: true,
      userGroup: true,
      createdAt: true,
      freeTrialUsed: true,
      mentorCredits: true,
      mentorCreditsConsumed: true,
      channelId: true,
      attributionJson: true,
      profile: {
        select: {
          status: true,
          birthMonth: true,
          major: true,
          workProvince: true,
          curProvince: true,
          careerAnxiety: true,
          registrationCompletedAt: true,
        },
      },
      interestAssessment: { select: { code: true } },
    },
  });

  const events = await prisma.event.findMany({
    select: {
      eventName: true,
      anonymousId: true,
      userId: true,
      userGroupSnapshot: true,
      page: true,
      props: true,
      serverTs: true,
      ua: true,
    },
  });

  const assistantMessages = await prisma.chatMessage.findMany({
    where: { role: 'assistant' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      entitlementSource: true,
      chatSession: { select: { userId: true, mentorId: true } },
    },
  });

  const orders = await prisma.paymentOrder.findMany({
    where: { status: 'PAID' },
    select: {
      userId: true,
      amount: true,
      paymentType: true,
      transactionId: true,
      paidAt: true,
      user: { select: { userGroup: true } },
    },
  });

  const activeSubs = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', endDate: { gt: now } },
    select: { userId: true },
  });

  const feedbackRows = await prisma.messageFeedback.findMany({
    select: { mentorId: true, feedbackType: true, reportReason: true, createdAt: true },
  });

  const cardGroups = await prisma.mentorKnowledgeCard.groupBy({
    by: ['mentorId'],
    where: { knowledgeClass: 'external_approved' },
    _count: { _all: true },
  });
  const cardCountMap: CountMap = {};
  for (const g of cardGroups) cardCountMap[g.mentorId] = g._count._all;

  const channels = await prisma.channel.findMany({ select: { id: true, code: true } });
  const channelCodeById = new Map(channels.map((c) => [c.id, c.code]));

  // ---------- 派生集合 ----------
  const normalUsers = users.filter((u) => u.userGroup === 'NORMAL');
  const isNormal = (groupId: string) => {
    const u = users.find((x) => x.id === groupId);
    return !!u && u.userGroup === 'NORMAL';
  };

  /** 真实付款订单（排除 mock；历史 mock 靠 transactionId 前缀识别） */
  const isRealOrder = (o: (typeof orders)[number]) =>
    !o.transactionId?.startsWith('mock_tx_');
  const realOrders = orders.filter(isRealOrder);

  // 每用户首次真实付款（按类型）
  const firstPaidByUser = new Map<
    string,
    { any: Date | null; SUBSCRIPTION: Date | null; CREDIT_PACK: Date | null }
  >();
  for (const u of users) {
    firstPaidByUser.set(u.id, { any: null, SUBSCRIPTION: null, CREDIT_PACK: null });
  }
  for (const o of realOrders) {
    if (!o.paidAt) continue;
    const entry = firstPaidByUser.get(o.userId);
    if (!entry) continue;
    if (!entry.any || o.paidAt < entry.any) entry.any = o.paidAt;
    const typeKey = o.paymentType === 'CREDIT_PACK' ? 'CREDIT_PACK' : 'SUBSCRIPTION';
    if (!entry[typeKey] || o.paidAt < entry[typeKey]) entry[typeKey] = o.paidAt;
  }

  // ==================== 平台日统计 ====================
  const platformRows: {
    date: Date;
    metricKey: string;
    channelCode: string | null;
    deviceType: string | null;
    userGroup: string | null;
    valueInt: number | null;
    valueDecimal: number | null;
    payload: string | null;
  }[] = [];

  const addPlatform = (
    metricKey: string,
    value: { int?: number; decimal?: number; payload?: unknown },
    dims: { channelCode?: string | null; deviceType?: string | null; userGroup?: string | null } = {},
  ) => {
    platformRows.push({
      date: dayStart,
      metricKey,
      channelCode: dims.channelCode ?? null,
      deviceType: dims.deviceType ?? null,
      userGroup: dims.userGroup ?? null,
      valueInt: value.int ?? null,
      valueDecimal: value.decimal ?? null,
      payload: value.payload !== undefined ? JSON.stringify(value.payload) : null,
    });
  };

  // 注册：当日新增（NORMAL），总量 + 按渠道
  const registeredToday = normalUsers.filter((u) => inWindow(u.createdAt));
  addPlatform('student.registration_count', { int: registeredToday.length });
  const regByChannel: CountMap = {};
  for (const u of registeredToday) {
    addTo(regByChannel, u.channelId ? channelCodeById.get(u.channelId) ?? 'UNKNOWN' : 'NATURAL');
  }
  for (const [code, n] of Object.entries(regByChannel)) {
    addPlatform('student.registration_count', { int: n }, { channelCode: code });
  }

  // 会员快照（任务运行时点）
  const activeSubUsers = new Set(activeSubs.map((s) => s.userId));
  const paidUsers = new Set(realOrders.filter((o) => isNormal(o.userId)).map((o) => o.userId));
  const activePaidCount = [...activeSubUsers].filter((id) => isNormal(id)).length;
  addPlatform('student.active_paid_count', { int: activePaidCount });
  addPlatform('student.historical_paid_count', { int: paidUsers.size });
  addPlatform('student.lapsed_paid_count', {
    int: [...paidUsers].filter((id) => !activeSubUsers.has(id)).length,
  });

  // 试用 / 加榨包余额
  addPlatform('student.free_trial_used_count', {
    int: normalUsers.filter((u) => u.freeTrialUsed > 0).length,
  });
  addPlatform('student.credit_pack_balance', {
    int: normalUsers.reduce(
      (sum, u) => sum + Math.max(0, u.mentorCredits - u.mentorCreditsConsumed),
      0,
    ),
  });

  // 当日活跃用户（NORMAL，按窗口内事件归属）
  const activeUserIds = new Set<string>();
  for (const e of events) {
    if (!e.userId || !inWindow(e.serverTs)) continue;
    if (e.userGroupSnapshot && e.userGroupSnapshot !== 'NORMAL') continue;
    activeUserIds.add(e.userId);
  }
  const newUserCount = registeredToday.filter((u) => activeUserIds.has(u.id)).length;
  const returningUserCount = normalUsers.filter(
    (u) => u.createdAt < dayStart && activeUserIds.has(u.id),
  ).length;
  addPlatform('student.new_user_count', { int: newUserCount });
  addPlatform('student.returning_user_count', { int: returningUserCount });

  // 活跃小时分布：窗口内 page.view，按人×小时去重（北京小时）
  const hourUsers: Set<string>[] = Array.from({ length: 24 }, () => new Set());
  for (const e of events) {
    if (e.eventName !== 'page.view' || !inWindow(e.serverTs)) continue;
    const bj = new Date(e.serverTs.getTime() + BJ_OFFSET);
    const key = e.userId ?? e.anonymousId ?? '?';
    hourUsers[bj.getUTCHours()].add(key);
  }
  addPlatform('student.active_hour_dist', {
    payload: { dist: hourUsers.map((s) => s.size) },
  });

  // 设备分布：窗口内 page.view，按身份去重
  const deviceUsers: Record<DeviceType, Set<string>> = {
    ios: new Set(),
    android: new Set(),
    desktop: new Set(),
    other: new Set(),
  };
  for (const e of events) {
    if (e.eventName !== 'page.view' || !inWindow(e.serverTs)) continue;
    const key = e.userId ?? e.anonymousId ?? '?';
    deviceUsers[parseDevice(e.ua)].add(key);
  }
  addPlatform('student.client_dist', {
    payload: {
      ios: deviceUsers.ios.size,
      android: deviceUsers.android.size,
      desktop: deviceUsers.desktop.size,
      other: deviceUsers.other.size,
      pwa: 0, // PWA 标记尚未随 page.view 采集
    },
  });

  // 档案结构分布
  const profileDist = {
    status: {} as CountMap,
    ageBand: {} as CountMap,
    major: {} as CountMap,
    workProvince: {} as CountMap,
    curProvince: {} as CountMap,
    riasecPrimary: {} as CountMap,
  };
  for (const u of normalUsers) {
    const p = u.profile;
    if (p) {
      if (p.status) addTo(profileDist.status, p.status);
      if (p.major) addTo(profileDist.major, p.major);
      if (p.workProvince) addTo(profileDist.workProvince, p.workProvince);
      if (p.curProvince) addTo(profileDist.curProvince, p.curProvince);
      if (p.birthMonth) {
        const bYear = parseInt(p.birthMonth.slice(0, 4), 10);
        const bMonth = parseInt(p.birthMonth.slice(5, 7), 10);
        if (bYear > 1900) {
          let age = now.getUTCFullYear() - bYear;
          if (now.getUTCMonth() + 1 < bMonth) age -= 1;
          const band =
            age < 20 ? '<20' : age <= 22 ? '20-22' : age <= 25 ? '23-25' : age <= 30 ? '26-30' : '>30';
          addTo(profileDist.ageBand, band);
        }
      }
    }
    if (u.interestAssessment?.code) {
      addTo(profileDist.riasecPrimary, u.interestAssessment.code.charAt(0));
    }
  }
  addPlatform('student.profile_dist', {
    payload: {
      status: topN(profileDist.status, 10),
      ageBand: topN(profileDist.ageBand, 10),
      major: topN(profileDist.major, 12),
      workProvince: topN(profileDist.workProvince, 12),
      curProvince: topN(profileDist.curProvince, 12),
      riasecPrimary: topN(profileDist.riasecPrimary, 8),
    },
  });

  // ==================== A/B 付费贡献（先算，分身行要用） ====================
  /** 用户已完成的计费问答轮（全部历史），带分身与时间 */
  const roundsByUser = new Map<
    string,
    { mentorId: string; time: Date; source: string }[]
  >();
  for (const m of assistantMessages) {
    const src = m.entitlementSource;
    if (!isCompletedSource(src)) continue;
    const list = roundsByUser.get(m.chatSession.userId) ?? [];
    list.push({ mentorId: m.chatSession.mentorId, time: m.createdAt, source: src ?? 'UNKNOWN' });
    roundsByUser.set(m.chatSession.userId, list);
  }

  // 每分身累计贡献权重（按 paymentType 分列）
  const contributionMap = new Map<
    string,
    { SUBSCRIPTION: number; CREDIT_PACK: number }
  >();
  for (const m of mentors) {
    contributionMap.set(m.id, { SUBSCRIPTION: 0, CREDIT_PACK: 0 });
  }
  const addContribution = (mentorId: string, type: 'SUBSCRIPTION' | 'CREDIT_PACK', w: number) => {
    const entry = contributionMap.get(mentorId);
    if (!entry) return;
    entry[type] = Number((entry[type] + w).toFixed(2));
  };

  // 付费后实际使用分身（任一真实付款之后完成问答）
  const paidUsageByMentor = new Map<string, Set<string>>();

  for (const u of normalUsers) {
    const firsts = firstPaidByUser.get(u.id);
    if (!firsts) continue;
    const rounds = (roundsByUser.get(u.id) ?? []).filter((r) => r.time <= dayEnd);

    if (firsts.any) {
      for (const r of rounds) {
        if (r.time > firsts.any) {
          const set = paidUsageByMentor.get(r.mentorId) ?? new Set<string>();
          set.add(u.id);
          paidUsageByMentor.set(r.mentorId, set);
        }
      }
    }

    // 付款前在各分身主页的有效浏览秒数（全部历史事件）
    const browseSeconds: CountMap = {};
    for (const type of ['SUBSCRIPTION', 'CREDIT_PACK'] as const) {
      const T = firsts[type];
      if (!T || T > dayEnd) continue;

      for (const e of events) {
        if (
          e.eventName === 'page.active_duration' &&
          e.serverTs < T &&
          (e.userId === u.id || e.anonymousId === safeParseJson(u.attributionJson).aid)
        ) {
          const props = safeParseProps(e.props);
          const mentorId = props.mentorId;
          const secs = props.activeSeconds;
          if (typeof mentorId === 'string' && typeof secs === 'number') {
            addTo(browseSeconds, mentorId, secs);
          }
        }
      }

      const before = rounds.filter((r) => r.time < T && r.time >= new Date(T.getTime() - 7 * DAY_MS));
      const after = rounds.filter((r) => r.time > T && r.time <= new Date(T.getTime() + 7 * DAY_MS));
      const A = before.length ? before[before.length - 1].mentorId : null;
      const B = after.length ? after[0].mentorId : null;

      let assigned: { mentor: string; w: number }[] = [];
      if (!A) {
        // 付款前无问答：无法归因，贡献不倒推
        assigned = [];
      } else if (!B || A === B) {
        assigned = [{ mentor: A, w: 1 }];
      } else if ((browseSeconds[B] ?? 0) >= 5) {
        assigned = [
          { mentor: A, w: 0.5 },
          { mentor: B, w: 0.5 },
        ];
      } else {
        assigned = [{ mentor: A, w: 1 }];
      }
      for (const a of assigned) addContribution(a.mentor, type, a.w);
    }
  }

  // ==================== 分身日统计 ====================
  const mentorRows: {
    date: Date;
    mentorId: string;
    metricKey: string;
    valueInt: number | null;
    valueDecimal: number | null;
    payload: string | null;
    excluded: boolean;
  }[] = [];

  const addMentor = (
    mentorId: string,
    metricKey: string,
    value: { int?: number; decimal?: number; payload?: unknown },
  ) => {
    mentorRows.push({
      date: dayStart,
      mentorId,
      metricKey,
      valueInt: value.int ?? null,
      valueDecimal: value.decimal ?? null,
      payload: value.payload !== undefined ? JSON.stringify(value.payload) : null,
      excluded: false,
    });
  };

  for (const mentor of mentors) {
    // 窗口内分身相关事件
    let impressionCount = 0;
    const impressionIds = new Set<string>();
    let profileViewCount = 0;
    const profileViewIds = new Set<string>();
    let activeTime = 0;

    for (const e of events) {
      if (!inWindow(e.serverTs)) continue;
      const props = safeParseProps(e.props);
      const personKey = e.userId ?? e.anonymousId ?? '?';
      if (e.eventName === 'mentor_card.impression' && props.mentorId === mentor.id) {
        impressionCount++;
        impressionIds.add(personKey);
      } else if (e.eventName === 'mentor_profile.view' && props.mentorId === mentor.id) {
        profileViewCount++;
        profileViewIds.add(personKey);
      } else if (e.eventName === 'page.active_duration' && props.mentorId === mentor.id) {
        activeTime += typeof props.activeSeconds === 'number' ? props.activeSeconds : 0;
      }
    }

    // 消息（本窗口 + 截至日末累计）
    const mentorMsgs = assistantMessages.filter(
      (m) => m.chatSession.mentorId === mentor.id && isNormal(m.chatSession.userId),
    );
    const windowMsgs = mentorMsgs.filter((m) => inWindow(m.createdAt));
    const cumMsgs = mentorMsgs.filter((m) => m.createdAt < dayEnd);

    const completedWindow = windowMsgs.filter((m) => isCompletedSource(m.entitlementSource));
    const billedWindow = windowMsgs.filter(
      (m) => isSubscriptionSource(m.entitlementSource) || m.entitlementSource === 'CREDIT_PACK',
    );
    const freeWindow = windowMsgs.filter((m) => m.entitlementSource === 'FREE_TRIAL');
    const nonBillingWindow = windowMsgs.filter((m) => m.entitlementSource === 'NON_BILLING');

    const cumCompleted = cumMsgs.filter((m) => isCompletedSource(m.entitlementSource));
    const helpedUsers = new Set(cumCompleted.map((m) => m.chatSession.userId));
    const billedUsers = new Set(
      cumMsgs
        .filter((m) => isSubscriptionSource(m.entitlementSource) || m.entitlementSource === 'CREDIT_PACK')
        .map((m) => m.chatSession.userId),
    );

    addMentor(mentor.id, 'mentor.impression_count', { int: impressionCount });
    addMentor(mentor.id, 'mentor.impression_user_count', { int: impressionIds.size });
    addMentor(mentor.id, 'mentor.profile_view_count', { int: profileViewCount });
    addMentor(mentor.id, 'mentor.profile_view_user_count', { int: profileViewIds.size });
    addMentor(mentor.id, 'mentor.completed_qa_rounds', { int: completedWindow.length });
    addMentor(mentor.id, 'mentor.billed_rounds', { int: billedWindow.length });
    addMentor(mentor.id, 'mentor.free_trial_rounds', { int: freeWindow.length });
    addMentor(mentor.id, 'mentor.non_billing_replies', { int: nonBillingWindow.length });
    addMentor(mentor.id, 'mentor.helped_user_count', { int: helpedUsers.size });
    addMentor(mentor.id, 'mentor.paid_round_user_count', { int: billedUsers.size });
    addMentor(mentor.id, 'mentor.paid_usage_user_count', {
      int: paidUsageByMentor.get(mentor.id)?.size ?? 0,
    });
    addMentor(mentor.id, 'mentor.avg_rounds_per_user', {
      decimal: helpedUsers.size
        ? Number((cumCompleted.length / helpedUsers.size).toFixed(2))
        : 0,
    });
    addMentor(mentor.id, 'mentor.rounds_by_entitlement', {
      payload: {
        FREE_TRIAL: freeWindow.length,
        CREDIT_PACK: windowMsgs.filter((m) => m.entitlementSource === 'CREDIT_PACK').length,
        SUBSCRIPTION_TOTAL: windowMsgs.filter((m) => isSubscriptionSource(m.entitlementSource)).length,
        SUBSCRIPTION_MONTHLY: windowMsgs.filter((m) => m.entitlementSource === 'SUBSCRIPTION_MONTHLY').length,
        SUBSCRIPTION_QUARTERLY: windowMsgs.filter((m) => m.entitlementSource === 'SUBSCRIPTION_QUARTERLY').length,
        SUBSCRIPTION_YEARLY: windowMsgs.filter((m) => m.entitlementSource === 'SUBSCRIPTION_YEARLY').length,
        SUBSCRIPTION_UNKNOWN: windowMsgs.filter((m) => m.entitlementSource === 'SUBSCRIPTION').length,
        NON_BILLING: nonBillingWindow.length,
      },
    });

    const contrib = contributionMap.get(mentor.id)!;
    addMentor(mentor.id, 'mentor.payment_contribution_weight', {
      payload: { SUBSCRIPTION: contrib.SUBSCRIPTION, CREDIT_PACK: contrib.CREDIT_PACK },
    });
    addMentor(mentor.id, 'mentor.estimated_active_time', { int: activeTime });

    // 反馈（窗口内）
    const fb = feedbackRows.filter((f) => f.mentorId === mentor.id && inWindow(f.createdAt));
    addMentor(mentor.id, 'mentor.feedback_like_count', {
      int: fb.filter((f) => f.feedbackType === 'LIKE').length,
    });
    addMentor(mentor.id, 'mentor.feedback_dislike_count', {
      int: fb.filter((f) => f.feedbackType === 'DISLIKE').length,
    });
    const reports = fb.filter((f) => f.feedbackType === 'REPORT');
    addMentor(mentor.id, 'mentor.feedback_report_count', {
      payload: {
        total: reports.length,
        reasons: (() => {
          const map: CountMap = {};
          for (const r of reports) addTo(map, r.reportReason ?? 'OTHER');
          return topN(map, 8);
        })(),
      },
    });

    addMentor(mentor.id, 'mentor.knowledge_card_count', {
      int: cardCountMap[mentor.id] ?? 0,
    });

    // 焦虑归类（LLM）：该分身已帮助用户的 careerAnxiety 原文
    const anxietyTexts = normalUsers
      .filter((u) => helpedUsers.has(u.id))
      .map((u) => u.profile?.careerAnxiety?.trim())
      .filter((t): t is string => !!t && t.length >= 3);
    const anxietyCats = await categorizeAnxieties(anxietyTexts);
    addMentor(mentor.id, 'mentor.anxiety_categories', {
      payload: anxietyCats ?? { unavailable: true, sourceCount: anxietyTexts.length },
    });
  }

  // ==================== 旅程预聚合 ====================
  const journeyRows: {
    date: Date;
    cohort: string;
    stage: string;
    channel: string | null;
    campaign: string | null;
    deviceType: string | null;
    topPages: string;
    topCtas: string;
    dwellByPage: string;
    userCount: number;
  }[] = [];

  // key: cohort|stage|channel -> 累加器
  const journeyAcc = new Map<
    string,
    { pages: CountMap; ctas: CountMap; dwell: CountMap; users: Set<string> }
  >();

  const accumulateJourney = (
    cohort: string,
    stage: string,
    channel: string,
    userId: string,
    listEvents: {
      eventName: string;
      page: string;
      props: string | null;
      serverTs: Date;
    }[],
  ) => {
    const key = `${cohort}|${stage}|${channel}`;
    let acc = journeyAcc.get(key);
    if (!acc) {
      acc = { pages: {}, ctas: {}, dwell: {}, users: new Set() };
      journeyAcc.set(key, acc);
    }
    acc.users.add(userId);
    for (const e of listEvents) {
      if (e.eventName === 'page.view') addTo(acc.pages, e.page);
      else if (e.eventName === 'cta.click') {
        const ctaId = safeParseProps(e.props).ctaId;
        if (typeof ctaId === 'string') addTo(acc.ctas, ctaId);
      } else if (e.eventName === 'page.active_duration') {
        const props = safeParseProps(e.props);
        if (typeof props.activeSeconds === 'number') {
          addTo(acc.dwell, e.page, props.activeSeconds);
        }
      }
    }
  };

  for (const u of normalUsers) {
    const aid = safeParseJson(u.attributionJson).aid;
    const aidStr = typeof aid === 'string' ? aid : null;
    const channel = u.channelId ? channelCodeById.get(u.channelId) ?? 'NATURAL' : 'NATURAL';
    const firstPaid = firstPaidByUser.get(u.id)?.any ?? null;

    // 阶段一：绑定匿名段，注册前事件
    if (aidStr) {
      const stage1Events = events.filter(
        (e) =>
          e.anonymousId === aidStr &&
          e.serverTs < u.createdAt &&
          !isBot(e.ua),
      );
      if (stage1Events.length) {
        const cohort = beijingDayKey(stage1Events[0].serverTs);
        accumulateJourney(cohort, 'stage1', channel, u.id, stage1Events);
      }
    }

    // 阶段二：注册 → 首次真实付款
    const stage2Events = events.filter(
      (e) =>
        e.userId === u.id &&
        e.serverTs >= u.createdAt &&
        (firstPaid ? e.serverTs < firstPaid : true) &&
        e.serverTs < dayEnd,
    );
    if (stage2Events.length) {
      const cohort = aidStr
        ? beijingDayKey(
            events.find((e) => e.anonymousId === aidStr)?.serverTs ?? u.createdAt,
          )
        : beijingDayKey(u.createdAt);
      accumulateJourney(
        cohort,
        firstPaid ? 'stage2' : 'unpaid_stage2',
        channel,
        u.id,
        stage2Events,
      );
    }
  }

  for (const [key, acc] of journeyAcc) {
    const [cohort, stage, channel] = key.split('|');
    journeyRows.push({
      date: dayStart,
      cohort,
      stage,
      channel,
      campaign: null,
      deviceType: null,
      topPages: JSON.stringify(topN(acc.pages, 15)),
      topCtas: JSON.stringify(topN(acc.ctas, 15)),
      dwellByPage: JSON.stringify(topN(acc.dwell, 15)),
      userCount: acc.users.size,
    });
  }

  // ==================== 同期批次漏斗 ====================
  // 每用户阶段时间戳
  const userStages = new Map<
    string,
    { S1: Date; S2: Date; S3: Date | null; S4: Date | null; S5: Date | null; S6: Date | null; S7: Date | null; aid: string | null }
  >();

  for (const u of normalUsers) {
    const aid = safeParseJson(u.attributionJson).aid;
    const aidStr = typeof aid === 'string' ? aid : null;
    // S1：匿名段中注册前最早的正常 page.view
    let s1: Date | null = null;
    if (aidStr) {
      for (const e of events) {
        if (
          e.anonymousId === aidStr &&
          e.eventName === 'page.view' &&
          e.serverTs < u.createdAt &&
          !isBot(e.ua) &&
          !/^\/(admin|api)/.test(e.page)
        ) {
          if (!s1 || e.serverTs < s1) s1 = e.serverTs;
        }
      }
    }
    if (!s1) continue;

    const userEvents = events.filter((e) => e.userId === u.id);
    const firstOf = (pred: (eName: string, props: Record<string, unknown>) => boolean) => {
      let t: Date | null = null;
      for (const e of userEvents) {
        if (pred(e.eventName, safeParseProps(e.props)) && (!t || e.serverTs < t)) t = e.serverTs;
      }
      return t;
    };

    const userRounds = assistantMessages.filter(
      (m) => m.chatSession.userId === u.id && isCompletedSource(m.entitlementSource),
    );
    const s5 = userRounds.length ? userRounds[0].createdAt : null;
    const s6 = firstOf((n) => n === 'paywall.view');
    const s7 = firstPaidByUser.get(u.id)?.any ?? null;

    userStages.set(u.id, {
      S1: s1,
      S2: u.createdAt,
      S3: u.profile?.registrationCompletedAt ?? null,
      S4: firstOf((n) => n === 'mentor_profile.view'),
      S5: s5,
      S6: s6,
      S7: s7,
      aid: aidStr,
    });
  }

  // 按周（S1 周一）分 cohort，7/14/30 窗口
  type UserStageInfo = NonNullable<(typeof userStages) extends Map<string, infer V> ? V : never>;
  const cohortWeek = new Map<string, { userId: string; st: UserStageInfo }[]>();
  for (const [userId, st] of userStages) {
    const wk = beijingDayKey(beijingWeekStart(st.S1));
    const list = cohortWeek.get(wk) ?? [];
    list.push({ userId, st });
    cohortWeek.set(wk, list);
  }

  const stageKeys = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'] as const;
  const cohortPayload: unknown[] = [];

  for (const [wk, list] of [...cohortWeek.entries()].sort()) {
    const weekEnd = new Date(new Date(wk).getTime() + BJ_OFFSET + 7 * DAY_MS - BJ_OFFSET);
    for (const windowDays of [7, 14, 30]) {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      for (const { st } of list) {
        for (let i = 0; i < stageKeys.length; i++) {
          const t = (st as unknown as Record<string, Date | null>)[stageKeys[i]];
          if (t && t.getTime() - st.S1.getTime() <= windowDays * DAY_MS) counts[i]++;
        }
      }
      // 成熟：批次落地末日（周一+6）+ 窗口 ≤ 日末
      const mature =
        new Date(weekEnd.getTime() + windowDays * DAY_MS).getTime() <= dayEnd.getTime();
      const stepRate = {
        S2: Number((counts[1] / counts[0]).toFixed(4)),
        S3: counts[1] ? Number((counts[2] / counts[1]).toFixed(4)) : null,
        S7: counts[5] ? Number((counts[6] / counts[5]).toFixed(4)) : null,
      };
      cohortPayload.push({
        cohort: wk,
        window: windowDays,
        mature,
        users: counts,
        stepRate,
        overallRate: counts.map((n) => Number((n / counts[0]).toFixed(4))),
      });
    }
  }
  addPlatform('funnel.stage_users', { payload: { cohorts: cohortPayload } });

  // 免费试用转付费（成熟批次）
  let trialMature = 0;
  let trialConverted = 0;
  for (const u of normalUsers) {
    const firstTrial = assistantMessages.find(
      (m) =>
        m.chatSession.userId === u.id &&
        m.entitlementSource === 'FREE_TRIAL' &&
        m.createdAt < dayEnd,
    );
    if (!firstTrial) continue;
    const F = firstTrial.createdAt;
    if (F.getTime() + 30 * DAY_MS > dayEnd.getTime()) continue; // 未完整经过观察期
    trialMature++;
    const paidAt = firstPaidByUser.get(u.id)?.any;
    if (paidAt && paidAt.getTime() - F.getTime() <= 30 * DAY_MS) trialConverted++;
  }
  addPlatform('funnel.free_trial_to_paid_30d', {
    payload: {
      matured: trialMature,
      converted: trialConverted,
      rate: trialMature ? Number((trialConverted / trialMature).toFixed(4)) : null,
    },
  });

  // 付费发生轮次分桶（付款前已完成轮次，含 0 轮）
  const roundBuckets = { '0': 0, '1-3': 0, '4-10': 0, '11-30': 0, '30+': 0 };
  for (const u of normalUsers) {
    const T = firstPaidByUser.get(u.id)?.any;
    if (!T) continue;
    const n = assistantMessages.filter(
      (m) =>
        m.chatSession.userId === u.id &&
        isCompletedSource(m.entitlementSource) &&
        m.createdAt < T,
    ).length;
    const bucket =
      n === 0 ? '0' : n <= 3 ? '1-3' : n <= 10 ? '4-10' : n <= 30 ? '11-30' : '30+';
    roundBuckets[bucket]++;
  }
  addPlatform('funnel.paid_at_completed_round', { payload: roundBuckets });

  // 渠道经营表现
  const channelPerf = new Map<
    string,
    {
      registered: number;
      landed: number;
      profileDone: number;
      qaUsers: Set<string>;
      paidSub: number;
      paidPack: number;
      revenueFen: number;
      conv30d: { base: number; paid: number };
    }
  >();
  const getPerf = (code: string) => {
    let p = channelPerf.get(code);
    if (!p) {
      p = {
        registered: 0,
        landed: 0,
        profileDone: 0,
        qaUsers: new Set(),
        paidSub: 0,
        paidPack: 0,
        revenueFen: 0,
        conv30d: { base: 0, paid: 0 },
      };
      channelPerf.set(code, p);
    }
    return p;
  };

  // 有过完成问答轮的用户（不依赖 S1，独立判定，避免登录型老用户漏统）
  const usersWithCompletedRound = new Set<string>();
  for (const m of assistantMessages) {
    if (isCompletedSource(m.entitlementSource) && m.createdAt < dayEnd) {
      usersWithCompletedRound.add(m.chatSession.userId);
    }
  }

  for (const u of normalUsers) {
    const code = u.channelId ? channelCodeById.get(u.channelId) ?? 'NATURAL' : 'NATURAL';
    if (u.createdAt >= dayEnd) continue;
    const p = getPerf(code);
    p.registered++;
    if (userStages.has(u.id)) p.landed++;
    if (u.profile?.registrationCompletedAt) p.profileDone++;
    if (usersWithCompletedRound.has(u.id)) p.qaUsers.add(u.id);
    // 30 天落地到付费（需要 S1 才能算落地时间）
    const st = userStages.get(u.id);
    if (st) {
      p.conv30d.base++;
      if (st.S7 && st.S7.getTime() - st.S1.getTime() <= 30 * DAY_MS) p.conv30d.paid++;
    }
  }
  for (const o of realOrders) {
    if (!o.paidAt || o.paidAt >= dayEnd) continue;
    const u = users.find((x) => x.id === o.userId);
    if (!u || u.userGroup !== 'NORMAL') continue;
    const code = u.channelId ? channelCodeById.get(u.channelId) ?? 'NATURAL' : 'NATURAL';
    const p = getPerf(code);
    if (o.paymentType === 'CREDIT_PACK') p.paidPack++;
    else p.paidSub++;
    p.revenueFen += Math.round(Number(o.amount) * 100);
  }

  addPlatform('funnel.channel_performance', {
    payload: {
      channels: [...channelPerf.entries()].map(([code, p]) => ({
        code,
        landed: p.landed,
        registered: p.registered,
        registerRate: p.landed ? Number((p.registered / p.landed).toFixed(4)) : null,
        profileDone: p.profileDone,
        qaUsers: p.qaUsers.size,
        paidSub: p.paidSub,
        paidPack: p.paidPack,
        revenueYuan: Number((p.revenueFen / 100).toFixed(2)),
        conv30d: p.conv30d.base
          ? Number((p.conv30d.paid / p.conv30d.base).toFixed(4))
          : null,
      })),
    },
  });

  // ---------- 批量写入 ----------
  if (platformRows.length) {
    await prisma.dailyPlatformStats.createMany({
      data: platformRows.map((r) => ({
        date: r.date,
        metricKey: r.metricKey,
        channelCode: r.channelCode,
        deviceType: r.deviceType,
        userGroup: r.userGroup,
        valueInt: r.valueInt,
        valueDecimal: r.valueDecimal,
        payload: r.payload,
        aggregationVersion: AGG_VERSION,
      })),
    });
  }
  if (mentorRows.length) {
    await prisma.dailyMentorStats.createMany({
      data: mentorRows.map((r) => ({
        date: r.date,
        mentorId: r.mentorId,
        metricKey: r.metricKey,
        valueInt: r.valueInt,
        valueDecimal: r.valueDecimal,
        payload: r.payload,
        excluded: r.excluded,
        aggregationVersion: AGG_VERSION,
      })),
    });
  }
  if (journeyRows.length) {
    await prisma.dailyJourneyStats.createMany({
      data: journeyRows.map((r) => ({
        date: r.date,
        cohort: r.cohort,
        stage: r.stage,
        channel: r.channel,
        campaign: r.campaign,
        deviceType: r.deviceType,
        topPages: r.topPages,
        topCtas: r.topCtas,
        dwellByPage: r.dwellByPage,
        userCount: r.userCount,
        aggregationVersion: AGG_VERSION,
      })),
    });
  }

  console.log(
    `[Aggregation] date=${beijingDayKey(dayStart)} platform=${platformRows.length} mentor=${mentorRows.length} journey=${journeyRows.length} version=${AGG_VERSION}`,
  );

  return {
    date: beijingDayKey(dayStart),
    platformRows: platformRows.length,
    mentorRows: mentorRows.length,
    journeyRows: journeyRows.length,
    version: AGG_VERSION,
  };
}
