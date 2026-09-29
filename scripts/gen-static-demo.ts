/**
 * 生成静态演示 JSON — 直接查库，保存到 public/demo/
 * npx tsx scripts/gen-static-demo.ts
 */
import { prisma } from '../src/lib/prisma';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const MENTOR_ID = 'lydiachen';
const RANGE = 90;
const DAY_MS = 24 * 3600_000;
const NOW = new Date();
const todayStart = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const rangeStart = new Date(todayStart.getTime() - RANGE * DAY_MS);
const tomorrow = new Date(todayStart.getTime() + DAY_MS);

const COMPLETED_SRC = ['FREE_TRIAL', 'CREDIT_PACK', 'SUBSCRIPTION', 'SUBSCRIPTION_MONTHLY', 'SUBSCRIPTION_QUARTERLY', 'SUBSCRIPTION_YEARLY'];
const isCompleted = (s: string | null) => s !== null && COMPLETED_SRC.includes(s);
const isBilled = (s: string | null) => s === 'CREDIT_PACK' || s?.startsWith('SUBSCRIPTION') === true;

function distinctPeople(rows: { userId: string | null; anonymousId: string | null; userGroupSnapshot: string | null }[]) {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.userGroupSnapshot === 'STAFF') continue;
    const key = r.userId ?? r.anonymousId;
    if (key) set.add(key);
  }
  return set.size;
}

function distinctPeopleScoped(rows: { userId: string | null; anonymousId: string | null; userGroupSnapshot: string | null; props: string | null }[], mentorId: string) {
  return distinctPeople(rows.filter(r => r.props?.includes(mentorId)));
}

interface PurchaseBucket { paidUsers: number; subscription: number; creditPack: number; monthly: number; quarterly: number; yearly: number; other: number; }
function emptyPurchases(): PurchaseBucket { return { paidUsers: 0, subscription: 0, creditPack: 0, monthly: 0, quarterly: 0, yearly: 0, other: 0 }; }
function tallyPurchases(userIds: string[]): PurchaseBucket {
  const b = emptyPurchases();
  if (userIds.length === 0) return b;
  const orders = { subscription: 0, creditPack: 0, monthly: 0, quarterly: 0, yearly: 0, other: 0 };
  const paidUsers = new Set<string>();
  // This is sync-like but we'll handle async in caller
  return b; // placeholder, real logic below
}

async function main() {
  const outDir = join(process.cwd(), 'public', 'demo');
  mkdirSync(outDir, { recursive: true });

  console.log('Generating summary.json...');
  // === Summary ===
  const mentorSessions = await prisma.chatSession.findMany({
    where: { mentorId: MENTOR_ID },
    select: { id: true, userId: true, user: { select: { userGroup: true } } },
  });
  const mentorSessionIds = mentorSessions.map(s => s.id);
  const mentorMessages = await prisma.chatMessage.findMany({
    where: { chatSessionId: { in: mentorSessionIds }, role: 'assistant' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, entitlementSource: true, chatSessionId: true },
  });

  // aggregateMessages
  const userInfo = new Map<string, { firstRound: number | null; hasFreeTrial: boolean }>();
  const sessionUserMap = new Map(mentorSessions.map(s => [s.id, s.userId]));
  for (const m of mentorMessages) {
    const uid = sessionUserMap.get(m.chatSessionId);
    if (!uid) continue;
    if (!isCompleted(m.entitlementSource)) continue;
    const info = userInfo.get(uid) ?? { firstRound: null, hasFreeTrial: false };
    if (info.firstRound === null) info.firstRound = m.createdAt.getTime();
    else info.firstRound = Math.min(info.firstRound, m.createdAt.getTime());
    if (m.entitlementSource === 'FREE_TRIAL') info.hasFreeTrial = true;
    userInfo.set(uid, info);
  }
  const helpedUsers = [...userInfo.values()].filter(v => v.firstRound !== null).length;
  const freeTrialUsers = [...userInfo.values()].filter(v => v.hasFreeTrial).length;
  const validSessions = new Set(mentorMessages.filter(m => isCompleted(m.entitlementSource)).map(m => m.chatSessionId)).size;

  // rounds by source
  const rc = { total: 0, freeTrial: 0, subscription: 0, subscriptionMonthly: 0, subscriptionQuarterly: 0, subscriptionYearly: 0, subscriptionUnknown: 0, creditPack: 0 };
  for (const m of mentorMessages) {
    const src = m.entitlementSource;
    if (!isCompleted(src)) continue;
    rc.total++;
    if (src === 'FREE_TRIAL') rc.freeTrial++;
    else if (src === 'CREDIT_PACK') rc.creditPack++;
    else if (src === 'SUBSCRIPTION') { rc.subscription++; rc.subscriptionUnknown++; }
    else if (src === 'SUBSCRIPTION_MONTHLY') { rc.subscription++; rc.subscriptionMonthly++; }
    else if (src === 'SUBSCRIPTION_QUARTERLY') { rc.subscription++; rc.subscriptionQuarterly++; }
    else if (src === 'SUBSCRIPTION_YEARLY') { rc.subscription++; rc.subscriptionYearly++; }
  }

  // in-range
  const helpedInRange = [...userInfo.values()].filter(v => v.firstRound !== null && v.firstRound >= rangeStart.getTime() && v.firstRound < tomorrow.getTime()).length;

  // events
  const [impressionEvents, profileEvents] = await Promise.all([
    prisma.event.findMany({ where: { eventName: 'mentor_card.impression' }, select: { userId: true, anonymousId: true, userGroupSnapshot: true, props: true } }),
    prisma.event.findMany({ where: { eventName: 'mentor_profile.view' }, select: { userId: true, anonymousId: true, userGroupSnapshot: true, props: true } }),
  ]);

  // feedback
  const [totalLikes, totalDislikes, totalReports, reportReasonRows] = await Promise.all([
    prisma.messageFeedback.count({ where: { mentorId: MENTOR_ID, feedbackType: 'LIKE' } }),
    prisma.messageFeedback.count({ where: { mentorId: MENTOR_ID, feedbackType: 'DISLIKE' } }),
    prisma.messageFeedback.count({ where: { mentorId: MENTOR_ID, feedbackType: 'REPORT' } }),
    prisma.messageFeedback.groupBy({ by: ['reportReason'], where: { mentorId: MENTOR_ID, feedbackType: 'REPORT' }, _count: { id: true } }),
  ]);
  const [rangeLikes, rangeDislikes, rangeReports] = await Promise.all([
    prisma.messageFeedback.count({ where: { mentorId: MENTOR_ID, feedbackType: 'LIKE', createdAt: { gte: rangeStart, lt: tomorrow } } }),
    prisma.messageFeedback.count({ where: { mentorId: MENTOR_ID, feedbackType: 'DISLIKE', createdAt: { gte: rangeStart, lt: tomorrow } } }),
    prisma.messageFeedback.count({ where: { mentorId: MENTOR_ID, feedbackType: 'REPORT', createdAt: { gte: rangeStart, lt: tomorrow } } }),
  ]);

  // knowledge cards + case cards
  const [knowledgeCardCount, caseCardCount] = await Promise.all([
    prisma.mentorKnowledgeCard.count({ where: { mentorId: MENTOR_ID, knowledgeClass: 'external_approved' } }),
    prisma.mentorKnowledgeCard.count({ where: { mentorId: MENTOR_ID, knowledgeClass: 'external_approved', caseText: { not: null } } }),
  ]);
  const [knowledgeCardCountAll, caseCardCountAll] = await Promise.all([
    prisma.mentorKnowledgeCard.count({ where: { knowledgeClass: 'external_approved' } }),
    prisma.mentorKnowledgeCard.count({ where: { knowledgeClass: 'external_approved', caseText: { not: null } } }),
  ]);

  // purchases - mentor
  const mentorUserIds = [...new Set(mentorSessions.map(s => s.userId))];
  const mentorPurchases = emptyPurchases();
  if (mentorUserIds.length > 0) {
    const mOrders = await prisma.paymentOrder.findMany({ where: { userId: { in: mentorUserIds }, status: 'PAID' }, select: { userId: true, paymentType: true, subscription: { select: { plan: true } } } });
    for (const o of mOrders) {
      mentorPurchases.paidUsers = -1; // will count below
      if (o.paymentType === 'SUBSCRIPTION') mentorPurchases.subscription++;
      else if (o.paymentType === 'CREDIT_PACK') mentorPurchases.creditPack++;
      if (o.subscription) {
        if (o.subscription.plan === 'MONTHLY') mentorPurchases.monthly++;
        else if (o.subscription.plan === 'QUARTERLY') mentorPurchases.quarterly++;
        else if (o.subscription.plan === 'YEARLY') mentorPurchases.yearly++;
        else mentorPurchases.other++;
      }
    }
    const paidSet = new Set(mOrders.map(o => o.userId));
    mentorPurchases.paidUsers = paidSet.size;
  }

  // platform totals via SQL
  const platformHelped = await prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cs.userId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN ('FREE_TRIAL','CREDIT_PACK','SUBSCRIPTION','SUBSCRIPTION_MONTHLY','SUBSCRIPTION_QUARTERLY','SUBSCRIPTION_YEARLY') AND u.userGroup = 'NORMAL'`) as { c: bigint }[];
  const platformFreeTrial = await prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cs.userId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource = 'FREE_TRIAL' AND u.userGroup = 'NORMAL'`) as { c: bigint }[];
  const platformValidSess = await prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cm.chatSessionId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN ('FREE_TRIAL','CREDIT_PACK','SUBSCRIPTION','SUBSCRIPTION_MONTHLY','SUBSCRIPTION_QUARTERLY','SUBSCRIPTION_YEARLY') AND u.userGroup = 'NORMAL'`) as { c: bigint }[];
  const platformSessCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ChatSession cs JOIN User u ON cs.userId = u.id WHERE u.userGroup = 'NORMAL'`) as { c: bigint }[];
  const platformHelpedInRange = await prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cs.userId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN ('FREE_TRIAL','CREDIT_PACK','SUBSCRIPTION','SUBSCRIPTION_MONTHLY','SUBSCRIPTION_QUARTERLY','SUBSCRIPTION_YEARLY') AND u.userGroup = 'NORMAL' AND cm.createdAt >= ? AND cm.createdAt < ?`, rangeStart, tomorrow) as { c: bigint }[];
  const platformRoundRows = await prisma.$queryRawUnsafe(`SELECT cm.entitlementSource AS src, COUNT(*) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN ('FREE_TRIAL','CREDIT_PACK','SUBSCRIPTION','SUBSCRIPTION_MONTHLY','SUBSCRIPTION_QUARTERLY','SUBSCRIPTION_YEARLY') AND u.userGroup = 'NORMAL' AND cm.createdAt >= ? AND cm.createdAt < ? GROUP BY cm.entitlementSource`, rangeStart, tomorrow) as { src: string; c: bigint }[];
  const platformRounds = { total: 0, freeTrial: 0, subscription: 0, creditPack: 0 };
  for (const r of platformRoundRows) {
    platformRounds.total += Number(r.c);
    if (r.src === 'FREE_TRIAL') platformRounds.freeTrial += Number(r.c);
    else if (r.src === 'CREDIT_PACK') platformRounds.creditPack += Number(r.c);
    else platformRounds.subscription += Number(r.c);
  }

  // platform purchases
  const platformPurchases = emptyPurchases();
  const [pTypeCounts, pPlanCounts] = await Promise.all([
    prisma.paymentOrder.groupBy({ by: ['paymentType'], where: { status: 'PAID' }, _count: { _all: true } }),
    prisma.subscription.groupBy({ by: ['plan'], _count: { _all: true } }),
  ]);
  for (const row of pTypeCounts) {
    if (row.paymentType === 'SUBSCRIPTION') platformPurchases.subscription = row._count._all;
    else if (row.paymentType === 'CREDIT_PACK') platformPurchases.creditPack = row._count._all;
  }
  for (const row of pPlanCounts) {
    if (row.plan === 'MONTHLY') platformPurchases.monthly = row._count._all;
    else if (row.plan === 'QUARTERLY') platformPurchases.quarterly = row._count._all;
    else if (row.plan === 'YEARLY') platformPurchases.yearly = row._count._all;
    else platformPurchases.other += row._count._all;
  }
  const platformPaidRow = await prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT userId) AS c FROM PaymentOrder WHERE status = 'PAID'`) as { c: bigint }[];
  platformPurchases.paidUsers = Number(platformPaidRow[0].c);

  const earliestMsg = mentorMessages[0]?.createdAt ?? null;
  const dateRange = {
    start: earliestMsg ? new Date(earliestMsg.getTime() + 8 * 3600_000).toISOString().slice(0, 10) : null,
    end: new Date(todayStart.getTime() + 8 * 3600_000).toISOString().slice(0, 10),
  };

  const summary = {
    range: RANGE,
    dateRange,
    cumulative: {
      helpedUsers,
      impressionUsers: distinctPeopleScoped(impressionEvents, MENTOR_ID),
      profileViewUsers: distinctPeopleScoped(profileEvents, MENTOR_ID),
      freeTrialUsers,
      paidRoundUsers: mentorPurchases.paidUsers,
      conversationCount: validSessions,
      sessionCount: mentorSessions.length,
      feedback: { likes: totalLikes, dislikes: totalDislikes, reports: totalReports, reportReasons: Object.fromEntries(reportReasonRows.map(r => [r.reportReason ?? 'OTHER', r._count.id])) },
      knowledgeCardCount,
      caseCardCount,
      rounds: rc.total,
      freeTrialRounds: rc.freeTrial,
      subscriptionRounds: rc.subscription,
      subscriptionMonthlyRounds: rc.subscriptionMonthly,
      subscriptionQuarterlyRounds: rc.subscriptionQuarterly,
      subscriptionYearlyRounds: rc.subscriptionYearly,
      subscriptionUnknownRounds: rc.subscriptionUnknown,
      creditPackRounds: rc.creditPack,
      subscriptionPurchases: mentorPurchases.subscription,
      creditPackPurchases: mentorPurchases.creditPack,
      subscriptionMonthlyPurchases: mentorPurchases.monthly,
      subscriptionQuarterlyPurchases: mentorPurchases.quarterly,
      subscriptionYearlyPurchases: mentorPurchases.yearly,
      subscriptionOtherPurchases: mentorPurchases.other,
    },
    inRange: {
      helpedUsers: helpedInRange,
      rounds: rc.total,
      freeTrialRounds: rc.freeTrial,
      subscriptionRounds: rc.subscription,
      subscriptionMonthlyRounds: rc.subscriptionMonthly,
      subscriptionQuarterlyRounds: rc.subscriptionQuarterly,
      subscriptionYearlyRounds: rc.subscriptionYearly,
      subscriptionUnknownRounds: rc.subscriptionUnknown,
      creditPackRounds: rc.creditPack,
      likes: rangeLikes,
      dislikes: rangeDislikes,
      reports: rangeReports,
    },
    platform: {
      cumulative: {
        helpedUsers: Number(platformHelped[0].c),
        impressionUsers: distinctPeople(impressionEvents),
        profileViewUsers: distinctPeople(profileEvents),
        freeTrialUsers: Number(platformFreeTrial[0].c),
        paidRoundUsers: platformPurchases.paidUsers,
        conversationCount: Number(platformValidSess[0].c),
        sessionCount: Number(platformSessCount[0].c),
        knowledgeCardCount: knowledgeCardCountAll,
        caseCardCount: caseCardCountAll,
        subscriptionPurchases: platformPurchases.subscription,
        creditPackPurchases: platformPurchases.creditPack,
        subscriptionMonthlyPurchases: platformPurchases.monthly,
        subscriptionQuarterlyPurchases: platformPurchases.quarterly,
        subscriptionYearlyPurchases: platformPurchases.yearly,
        subscriptionOtherPurchases: platformPurchases.other,
      },
      inRange: {
        helpedUsers: Number(platformHelpedInRange[0].c),
        rounds: platformRounds.total,
        freeTrialRounds: platformRounds.freeTrial,
        subscriptionRounds: platformRounds.subscription,
        creditPackRounds: platformRounds.creditPack,
      },
    },
  };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('  summary.json saved');

  // === Trend ===
  console.log('Generating trend.json...');
  const TREND_RANGE = 60;
  const trendStart = new Date(todayStart.getTime() - TREND_RANGE * DAY_MS);
  const trendEnd = new Date(trendStart.getTime() + TREND_RANGE * DAY_MS);

  const DAILY_METRICS = ['mentor.completed_qa_rounds', 'mentor.billed_rounds', 'mentor.free_trial_rounds', 'mentor.non_billing_replies', 'mentor.impression_count', 'mentor.profile_view_count', 'mentor.feedback_like_count', 'mentor.feedback_dislike_count', 'mentor.feedback_report_count'];
  const CUMULATIVE_METRICS = ['mentor.helped_user_count'];

  const rows = await prisma.dailyMentorStats.findMany({
    where: { mentorId: MENTOR_ID, date: { gte: trendStart, lte: trendEnd } },
    select: { date: true, metricKey: true, valueInt: true },
  });
  const rowMap = new Map<string, number>();
  for (const r of rows) rowMap.set(`${r.date.getTime()}|${r.metricKey}`, r.valueInt ?? 0);

  const sessionsBefore = await prisma.chatSession.count({ where: { mentorId: MENTOR_ID, createdAt: { lt: trendStart } } });
  const sessionsInRange = await prisma.chatSession.findMany({ where: { mentorId: MENTOR_ID, createdAt: { gte: trendStart, lte: trendEnd } }, select: { createdAt: true } });
  const sessionByDayMs = new Map<number, number>();
  for (const s of sessionsInRange) {
    const dayMs = Math.floor((s.createdAt.getTime() + 8 * 3600_000) / DAY_MS) * DAY_MS - 8 * 3600_000;
    sessionByDayMs.set(dayMs, (sessionByDayMs.get(dayMs) ?? 0) + 1);
  }

  const paidBefore = await prisma.paymentOrder.count({ where: { status: 'PAID', createdAt: { lt: trendStart } } });
  const paidInRange = await prisma.paymentOrder.findMany({ where: { status: 'PAID', createdAt: { gte: trendStart, lte: trendEnd } }, select: { createdAt: true } });
  const paidByDayMs = new Map<number, number>();
  for (const p of paidInRange) {
    const dayMs = Math.floor((p.createdAt.getTime() + 8 * 3600_000) / DAY_MS) * DAY_MS - 8 * 3600_000;
    paidByDayMs.set(dayMs, (paidByDayMs.get(dayMs) ?? 0) + 1);
  }

  const days: Record<string, unknown>[] = [];
  const cumulativeLast: Record<string, number> = {};
  for (const key of CUMULATIVE_METRICS) cumulativeLast[key] = 0;

  let cumulativeSessions = sessionsBefore;
  let cumulativePaid = paidBefore;

  for (let i = 0; i < TREND_RANGE; i++) {
    const d = new Date(trendStart.getTime() + i * DAY_MS);
    const bj = new Date(d.getTime() + 8 * 3600_000);
    const entry: Record<string, unknown> = { date: bj.toISOString().slice(0, 10) };

    for (const key of DAILY_METRICS) {
      const v = rowMap.get(`${d.getTime()}|${key}`) ?? 0;
      entry[key] = v;
    }
    for (const key of CUMULATIVE_METRICS) {
      cumulativeLast[key] += rowMap.get(`${d.getTime()}|${key}`) ?? 0;
      entry[key] = cumulativeLast[key];
    }

    cumulativeSessions += sessionByDayMs.get(d.getTime()) ?? 0;
    entry['mentor.cumulative_session_count'] = cumulativeSessions;

    cumulativePaid += paidByDayMs.get(d.getTime()) ?? 0;
    entry['mentor.cumulative_paid_purchase_count'] = cumulativePaid;

    days.push(entry);
  }

  const trend = { range: TREND_RANGE, daily: days };
  writeFileSync(join(outDir, 'trend.json'), JSON.stringify(trend, null, 2));
  console.log('  trend.json saved');

  console.log('\nDone! Static demo data saved to public/demo/');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
