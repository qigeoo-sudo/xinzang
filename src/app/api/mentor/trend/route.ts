/**
 * 导师趋势序列 — GET /api/mentor/trend?range=30
 * 从 DailyMentorStats 读按日值，缺日行补零；累计类指标沿用上一值。
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMentorContext, errorResponse } from '@/lib/mentor-console-api';
import { beijingDayStart } from '@/lib/aggregation';

const DAY_MS = 24 * 3600_000;
const ALLOWED_RANGES = [3, 7, 14, 30, 60, 90];

const DAILY_METRICS = [
  'mentor.completed_qa_rounds',
  'mentor.billed_rounds',
  'mentor.free_trial_rounds',
  'mentor.non_billing_replies',
  'mentor.impression_count',
  'mentor.profile_view_count',
  'mentor.feedback_like_count',
  'mentor.feedback_dislike_count',
] as const;

const CUMULATIVE_METRICS = ['mentor.helped_user_count', 'mentor.knowledge_card_count'] as const;

export async function GET(request: NextRequest) {
  try {
    const { mentorId } = await requireMentorContext();

    const rangeParam = Number(request.nextUrl.searchParams.get('range') ?? '30');
    const range = ALLOWED_RANGES.includes(rangeParam) ? rangeParam : 30;

    const todayStart = beijingDayStart(new Date());
    const start = new Date(todayStart.getTime() - (range - 1) * DAY_MS);

    const rows = await prisma.dailyMentorStats.findMany({
      where: {
        mentorId,
        date: { gte: start, lte: todayStart },
        excluded: false,
      },
      select: { date: true, metricKey: true, valueInt: true },
    });

    const rowMap = new Map<string, number>();
    for (const r of rows) {
      rowMap.set(`${r.date.getTime()}|${r.metricKey}`, r.valueInt ?? 0);
    }

    // 累计线程：实时查 ChatSession，按北京日累计
    const sessionsBefore = await prisma.chatSession.count({
      where: { mentorId, createdAt: { lt: start } },
    });
    const sessionsInRange = await prisma.chatSession.findMany({
      where: { mentorId, createdAt: { gte: start, lte: new Date(start.getTime() + range * DAY_MS) } },
      select: { createdAt: true },
    });
    const sessionByDayMs = new Map<number, number>();
    for (const s of sessionsInRange) {
      const dayMs = Math.floor((s.createdAt.getTime() + 8 * 3600_000) / DAY_MS) * DAY_MS - 8 * 3600_000;
      sessionByDayMs.set(dayMs, (sessionByDayMs.get(dayMs) ?? 0) + 1);
    }

    // 累计付费：实时查 PaymentOrder（PAID），按北京日累计（订阅+加榨包都算）
    const paidBefore = await prisma.paymentOrder.count({
      where: { status: 'PAID', createdAt: { lt: start } },
    });
    const paidInRange = await prisma.paymentOrder.findMany({
      where: { status: 'PAID', createdAt: { gte: start, lte: new Date(start.getTime() + range * DAY_MS) } },
      select: { createdAt: true },
    });
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

    for (let i = 0; i < range; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const bj = new Date(d.getTime() + 8 * 3600_000);
      const entry: Record<string, unknown> = {
        date: bj.toISOString().slice(0, 10),
      };
      for (const key of DAILY_METRICS) {
        entry[key.slice(7)] = rowMap.get(`${d.getTime()}|${key}`) ?? 0;
      }
      for (const key of CUMULATIVE_METRICS) {
        const v = rowMap.get(`${d.getTime()}|${key}`);
        if (typeof v === 'number') cumulativeLast[key] = v;
        entry[key.slice(7)] = cumulativeLast[key];
      }
      // 累计线程
      cumulativeSessions += sessionByDayMs.get(d.getTime()) ?? 0;
      entry['session_count'] = cumulativeSessions;
      // 累计付费
      cumulativePaid += paidByDayMs.get(d.getTime()) ?? 0;
      entry['paid_purchase_count'] = cumulativePaid;
      days.push(entry);
    }

    return Response.json({ range, days });
  } catch (e) {
    return errorResponse(e);
  }
}
