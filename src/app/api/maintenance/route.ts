/**
 * 维护任务 API — 通过定时调用执行清理与每日汇总
 * POST /api/maintenance
 * 需要 CRON_SECRET 环境变量验证（Authorization: Bearer <secret>）
 *
 * 可选请求体：
 *   { "date": "YYYY-MM-DD" }  仅执行该日期的汇总重算（幂等，同版本旧结果先删后写）
 * 不带 body：执行全部例行任务（订单过期、清理、当日汇总）
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  expirePendingOrders,
  cleanupOldChatMessages,
  cleanupIdleSessions,
} from '@/lib/maintenance';
import { runDailyAggregation } from '@/lib/aggregation';

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(expectedSecret);
  return tokenBuf.length === secretBuf.length && timingSafeEqual(tokenBuf, secretBuf);
}

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ---------- 指定日期：仅重算该日汇总 ----------
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const dateStr =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).date
      : undefined;
  if (typeof dateStr === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'date 格式应为 YYYY-MM-DD' }, { status: 400 });
    }
    // 北京日零点（按北京日历解析）
    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1, d) - 8 * 3600_000);
    const report = await runDailyAggregation({ date: target });
    return NextResponse.json({ success: true, report });
  }

  // ---------- 例行任务 ----------
  const results = {
    expiredOrders: 0,
    deletedMessages: 0,
    deletedSessions: 0,
    aggregation: null as Awaited<ReturnType<typeof runDailyAggregation>> | null,
    timestamp: new Date().toISOString(),
  };

  try {
    results.expiredOrders = await expirePendingOrders();
  } catch (e) {
    console.error('expirePendingOrders failed:', e);
  }

  try {
    results.deletedMessages = await cleanupOldChatMessages();
  } catch (e) {
    console.error('cleanupOldChatMessages failed:', e);
  }

  try {
    results.deletedSessions = await cleanupIdleSessions();
  } catch (e) {
    console.error('cleanupIdleSessions failed:', e);
  }

  try {
    results.aggregation = await runDailyAggregation();
  } catch (e) {
    console.error('runDailyAggregation failed:', e);
  }

  console.log(
    `[Maintenance] expired=${results.expiredOrders} deletedMsg=${results.deletedMessages} deletedSession=${results.deletedSessions} aggregated=${results.aggregation ? 'yes' : 'no'}`,
  );
  return NextResponse.json({ success: true, results: results.aggregation });
}
