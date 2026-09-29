/**
 * 导师首页/对话视图聚合 — GET /api/mentor/summary?range=7
 *
 * - 分身口径：累计类实时计算（去重口径准确）；范围内次数实时聚合
 * - 全站口径：同口径实时计算，作为分母（导师端默认隐藏）
 * - 订阅轮次按月/季/年/未知分档
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMentorContext, errorResponse } from '@/lib/mentor-console-api';
import {
  beijingDayStart,
  isSubscriptionSource,
  isCompletedSource,
} from '@/lib/aggregation';

const DAY_MS = 24 * 3600_000;
const ALLOWED_RANGES = [3, 7, 14, 30, 60, 90];

interface SessionRow {
  id: string;
  userId: string;
  user: { userGroup: string | null };
}
interface MessageRow {
  id: string;
  createdAt: Date;
  entitlementSource: string | null;
  chatSessionId: string;
}

interface MessageAgg {
  helpedUsers: number;
  helpedInRange: number;
  freeTrialUsers: number;
  validSessions: number;
  rounds: {
    total: number;
    freeTrial: number;
    subscription: number;
    subscriptionMonthly: number;
    subscriptionQuarterly: number;
    subscriptionYearly: number;
    subscriptionUnknown: number;
    creditPack: number;
  };
}

/** 对一组会话+assistant 消息做统一聚合（NORMAL 群组） */
function aggregateMessages(
  sessions: SessionRow[],
  messages: MessageRow[],
  rangeStart: Date,
  tomorrow: Date,
): MessageAgg {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const userInfo = new Map<
    string,
    { firstRound: Date | null; sources: Set<string> }
  >();
  const validSessionIds = new Set<string>();

  const rounds = {
    total: 0,
    freeTrial: 0,
    subscription: 0,
    subscriptionMonthly: 0,
    subscriptionQuarterly: 0,
    subscriptionYearly: 0,
    subscriptionUnknown: 0,
    creditPack: 0,
  };

  for (const m of messages) {
    const sess = sessionById.get(m.chatSessionId);
    if (!sess || sess.user.userGroup !== 'NORMAL') continue;

    const inRangeNow = m.createdAt >= rangeStart && m.createdAt < tomorrow;
    const src = m.entitlementSource;

    if (isCompletedSource(src)) {
      validSessionIds.add(m.chatSessionId);
      const info = userInfo.get(sess.userId) ?? { firstRound: null, sources: new Set() };
      if (!info.firstRound || m.createdAt < info.firstRound) info.firstRound = m.createdAt;
      info.sources.add(src ?? 'UNKNOWN');
      userInfo.set(sess.userId, info);
    }

    if (inRangeNow && isCompletedSource(src)) {
      rounds.total++;
      if (src === 'FREE_TRIAL') rounds.freeTrial++;
      if (src === 'CREDIT_PACK') rounds.creditPack++;
      if (isSubscriptionSource(src)) {
        rounds.subscription++;
        if (src === 'SUBSCRIPTION_MONTHLY') rounds.subscriptionMonthly++;
        else if (src === 'SUBSCRIPTION_QUARTERLY') rounds.subscriptionQuarterly++;
        else if (src === 'SUBSCRIPTION_YEARLY') rounds.subscriptionYearly++;
        else if (src === 'SUBSCRIPTION') rounds.subscriptionUnknown++;
      }
    }
  }

  return {
    helpedUsers: [...userInfo.values()].filter((i) => i.firstRound).length,
    helpedInRange: [...userInfo.values()].filter(
      (i) => i.firstRound && i.firstRound >= rangeStart,
    ).length,
    freeTrialUsers: [...userInfo.values()].filter((i) => i.sources.has('FREE_TRIAL')).length,
    validSessions: validSessionIds.size,
    rounds,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { mentorId } = await requireMentorContext();

    const rangeParam = Number(request.nextUrl.searchParams.get('range') ?? '7');
    const range = ALLOWED_RANGES.includes(rangeParam) ? rangeParam : 7;

    const todayStart = beijingDayStart(new Date());
    const rangeStart = new Date(todayStart.getTime() - (range - 1) * DAY_MS);
    const tomorrow = new Date(todayStart.getTime() + DAY_MS);

    // 会话：仅该分身（平台级用 SQL 聚合，不全量加载）
    const mentorSessions = await prisma.chatSession.findMany({
      where: { mentorId },
      select: { id: true, userId: true, user: { select: { userGroup: true } } },
    });

    // 消息：仅该分身的 assistant 消息
    const mentorSessionIds = mentorSessions.map((s) => s.id);
    const mentorMessages = await prisma.chatMessage.findMany({
      where: { chatSessionId: { in: mentorSessionIds }, role: 'assistant' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        entitlementSource: true,
        chatSessionId: true,
      },
    });

    const mentorAgg = aggregateMessages(mentorSessions, mentorMessages, rangeStart, tomorrow);

    // 平台级聚合：用 SQL COUNT 代替全量加载
    const COMPLETED_SRC = "'FREE_TRIAL','CREDIT_PACK','SUBSCRIPTION','SUBSCRIPTION_MONTHLY','SUBSCRIPTION_QUARTERLY','SUBSCRIPTION_YEARLY'";
    const platformAgg = await (async () => {
      const [helped, freeTrial, validSess, sessCount, helpedInRange, roundRows] = await Promise.all([
        prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cs.userId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN (${COMPLETED_SRC}) AND u.userGroup = 'NORMAL'`) as Promise<{ c: bigint }[]>,
        prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cs.userId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource = 'FREE_TRIAL' AND u.userGroup = 'NORMAL'`) as Promise<{ c: bigint }[]>,
        prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cm.chatSessionId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN (${COMPLETED_SRC}) AND u.userGroup = 'NORMAL'`) as Promise<{ c: bigint }[]>,
        prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ChatSession cs JOIN User u ON cs.userId = u.id WHERE u.userGroup = 'NORMAL'`) as Promise<{ c: bigint }[]>,
        prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT cs.userId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN (${COMPLETED_SRC}) AND u.userGroup = 'NORMAL' AND cm.createdAt >= ? AND cm.createdAt < ?`, rangeStart, tomorrow) as Promise<{ c: bigint }[]>,
        prisma.$queryRawUnsafe(`SELECT cm.entitlementSource AS src, COUNT(*) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN (${COMPLETED_SRC}) AND u.userGroup = 'NORMAL' AND cm.createdAt >= ? AND cm.createdAt < ? GROUP BY cm.entitlementSource`, rangeStart, tomorrow) as Promise<{ src: string; c: bigint }[]>,
      ]);
      const rounds = { total: 0, freeTrial: 0, subscription: 0, creditPack: 0 };
      for (const r of roundRows) {
        rounds.total += Number(r.c);
        if (r.src === 'FREE_TRIAL') rounds.freeTrial += Number(r.c);
        else if (r.src === 'CREDIT_PACK') rounds.creditPack += Number(r.c);
        else rounds.subscription += Number(r.c);
      }
      return {
        helpedUsers: Number(helped[0].c),
        freeTrialUsers: Number(freeTrial[0].c),
        validSessions: Number(validSess[0].c),
        sessionCount: Number(sessCount[0].c),
        helpedInRange: Number(helpedInRange[0].c),
        rounds,
      };
    })();

    // 购买次数：该分身用户的 PAID 订单 + 全站（全站直接用 SQL，不需 allUserIds）
    const mentorUserIds = [...new Set(mentorSessions.map((s) => s.userId))];

    interface PurchaseBreakdown {
      paidUsers: number;
      subscription: number;
      creditPack: number;
      monthly: number;
      quarterly: number;
      yearly: number;
      other: number;
    }
    const emptyPurchases = (): PurchaseBreakdown => ({
      paidUsers: 0, subscription: 0, creditPack: 0, monthly: 0, quarterly: 0, yearly: 0, other: 0,
    });

    const tallyPurchases = async (userIds: string[]): Promise<PurchaseBreakdown> => {
      const b = emptyPurchases();
      // 按 paymentType 计数 + 去重付费用户数
      const typeCounts = await prisma.paymentOrder.groupBy({
        by: ['paymentType'],
        where: { userId: { in: userIds }, status: 'PAID' },
        _count: { _all: true },
      });
      for (const row of typeCounts) {
        if (row.paymentType === 'SUBSCRIPTION') b.subscription = row._count._all;
        else if (row.paymentType === 'CREDIT_PACK') b.creditPack = row._count._all;
      }
      // 付费用户数（有任一 PAID 订单的去重用户）
      const paidUserRows = await prisma.paymentOrder.findMany({
        where: { userId: { in: userIds }, status: 'PAID' },
        select: { userId: true },
        distinct: ['userId'],
      });
      b.paidUsers = paidUserRows.length;
      // 按 Subscription.plan 计数
      const planCounts = await prisma.subscription.groupBy({
        by: ['plan'],
        where: { userId: { in: userIds } },
        _count: { _all: true },
      });
      for (const row of planCounts) {
        if (row.plan === 'MONTHLY') b.monthly = row._count._all;
        else if (row.plan === 'QUARTERLY') b.quarterly = row._count._all;
        else if (row.plan === 'YEARLY') b.yearly = row._count._all;
        else b.other += row._count._all;
      }
      return b;
    };

    const [mentorPurchases, platformPurchases] = await Promise.all([
      tallyPurchases(mentorUserIds),
      // 平台级购买统计：直接 SQL，不需要 allUserIds
      (async () => {
        const b = emptyPurchases();
        const [typeCounts, planCounts] = await Promise.all([
          prisma.paymentOrder.groupBy({
            by: ['paymentType'],
            where: { status: 'PAID' },
            _count: { _all: true },
          }),
          prisma.subscription.groupBy({
            by: ['plan'],
            _count: { _all: true },
          }),
        ]);
        for (const row of typeCounts) {
          if (row.paymentType === 'SUBSCRIPTION') b.subscription = row._count._all;
          else if (row.paymentType === 'CREDIT_PACK') b.creditPack = row._count._all;
        }
        for (const row of planCounts) {
          if (row.plan === 'MONTHLY') b.monthly = row._count._all;
          else if (row.plan === 'QUARTERLY') b.quarterly = row._count._all;
          else if (row.plan === 'YEARLY') b.yearly = row._count._all;
          else b.other += row._count._all;
        }
        // paidUsers = COUNT(DISTINCT userId) from PaymentOrder where status=PAID
        const paidRow = await prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT userId) AS c FROM PaymentOrder WHERE status = 'PAID'`) as { c: bigint }[];
        b.paidUsers = Number(paidRow[0].c);
        return b;
      })(),
    ]);

    // 曝光/主页去重（userId ∪ anonymousId，NORMAL 快照）
    const distinctPeople = (
      rows: {
        userId: string | null;
        anonymousId: string | null;
        userGroupSnapshot: string | null;
      }[],
    ) => {
      const ids = new Set<string>();
      for (const r of rows) {
        if (r.userGroupSnapshot && r.userGroupSnapshot !== 'NORMAL') continue;
        ids.add(r.userId ?? r.anonymousId ?? '?');
      }
      ids.delete('?');
      return ids.size;
    };

    const [impressionEvents, profileEvents] = await Promise.all([
      prisma.event.findMany({
        where: { eventName: 'mentor_card.impression' },
        select: {
          userId: true,
          anonymousId: true,
          userGroupSnapshot: true,
          props: true,
        },
      }),
      prisma.event.findMany({
        where: { eventName: 'mentor_profile.view' },
        select: {
          userId: true,
          anonymousId: true,
          userGroupSnapshot: true,
          props: true,
        },
      }),
    ]);

    // 反馈：分身 + 累计
    const feedbackWhere = {
      message: { chatSession: { mentorId } },
    };
    const [rangeLikes, rangeDislikes, rangeReports, totalLikes, totalDislikes, totalReports, reportReasonRows] =
      await Promise.all([
        prisma.messageFeedback.count({
          where: { ...feedbackWhere, createdAt: { gte: rangeStart, lt: tomorrow }, feedbackType: 'LIKE' },
        }),
        prisma.messageFeedback.count({
          where: { ...feedbackWhere, createdAt: { gte: rangeStart, lt: tomorrow }, feedbackType: 'DISLIKE' },
        }),
        prisma.messageFeedback.count({
          where: { ...feedbackWhere, createdAt: { gte: rangeStart, lt: tomorrow }, feedbackType: 'REPORT' },
        }),
        prisma.messageFeedback.count({ where: { ...feedbackWhere, feedbackType: 'LIKE' } }),
        prisma.messageFeedback.count({ where: { ...feedbackWhere, feedbackType: 'DISLIKE' } }),
        prisma.messageFeedback.count({ where: { ...feedbackWhere, feedbackType: 'REPORT' } }),
        prisma.messageFeedback.groupBy({
          by: ['reportReason'],
          where: { ...feedbackWhere, feedbackType: 'REPORT', reportReason: { not: null } },
          _count: { id: true },
        }),
      ]);

    // 知识卡数 + 案例卡数（caseText 非空即为案例卡）
    const [knowledgeCardCount, knowledgeCardCountAll, caseCardCount, caseCardCountAll] = await Promise.all([
      prisma.mentorKnowledgeCard.count({
        where: { mentorId, knowledgeClass: 'external_approved' },
      }),
      prisma.mentorKnowledgeCard.count({
        where: { knowledgeClass: 'external_approved' },
      }),
      prisma.mentorKnowledgeCard.count({
        where: { mentorId, knowledgeClass: 'external_approved', caseText: { not: null } },
      }),
      prisma.mentorKnowledgeCard.count({
        where: { knowledgeClass: 'external_approved', caseText: { not: null } },
      }),
    ]);

    const rc = mentorAgg.rounds;

    // 数据区间：最早一条消息到今天
    const earliestMsg = mentorMessages[0]?.createdAt;
    const dateRange = {
      start: earliestMsg
        ? new Date(earliestMsg.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
        : null,
      end: new Date(todayStart.getTime() + 8 * 3600_000).toISOString().slice(0, 10),
    };

    return Response.json({
      range,
      dateRange,
      cumulative: {
        helpedUsers: mentorAgg.helpedUsers,
        impressionUsers: distinctPeopleScoped(impressionEvents, mentorId),
        profileViewUsers: distinctPeopleScoped(profileEvents, mentorId),
        freeTrialUsers: mentorAgg.freeTrialUsers,
        paidRoundUsers: mentorPurchases.paidUsers,
        conversationCount: mentorAgg.validSessions,
        sessionCount: mentorSessions.length,
        feedback: {
          likes: totalLikes,
          dislikes: totalDislikes,
          reports: totalReports,
          reportReasons: Object.fromEntries(
            reportReasonRows.map((r) => [r.reportReason ?? 'OTHER', r._count.id]),
          ),
        },
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
        // 购买次数（按订单）
        subscriptionPurchases: mentorPurchases.subscription,
        creditPackPurchases: mentorPurchases.creditPack,
        subscriptionMonthlyPurchases: mentorPurchases.monthly,
        subscriptionQuarterlyPurchases: mentorPurchases.quarterly,
        subscriptionYearlyPurchases: mentorPurchases.yearly,
        subscriptionOtherPurchases: mentorPurchases.other,
      },
      inRange: {
        helpedUsers: mentorAgg.helpedInRange,
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
      // 全站分母（默认隐藏，导师主动点「显示全体」后出现）
      platform: {
        cumulative: {
          helpedUsers: platformAgg.helpedUsers,
          impressionUsers: distinctPeople(impressionEvents),
          profileViewUsers: distinctPeople(profileEvents),
          freeTrialUsers: platformAgg.freeTrialUsers,
          paidRoundUsers: platformPurchases.paidUsers,
          conversationCount: platformAgg.validSessions,
          sessionCount: platformAgg.sessionCount,
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
          helpedUsers: platformAgg.helpedInRange,
          rounds: platformAgg.rounds.total,
          freeTrialRounds: platformAgg.rounds.freeTrial,
          subscriptionRounds: platformAgg.rounds.subscription,
          creditPackRounds: platformAgg.rounds.creditPack,
        },
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 分身维度去重人数：先按 props.mentorId 过滤，再按 userId/anonymousId 去重 */
function distinctPeopleScoped(
  rows: {
    userId: string | null;
    anonymousId: string | null;
    userGroupSnapshot: string | null;
    props: string | null;
  }[],
  mentorId: string,
): number {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.userGroupSnapshot && r.userGroupSnapshot !== 'NORMAL') continue;
    let eventMentorId: string | undefined;
    try {
      eventMentorId = JSON.parse(r.props ?? '{}')?.mentorId;
    } catch {
      eventMentorId = undefined;
    }
    if (eventMentorId !== mentorId) continue;
    ids.add(r.userId ?? r.anonymousId ?? '?');
  }
  ids.delete('?');
  return ids.size;
}
