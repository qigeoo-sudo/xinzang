/**
 * 维护任务 API — 通过定时调用执行清理
 * POST /api/maintenance
 * 需要 CRON_SECRET 环境变量验证
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { expirePendingOrders, cleanupOldChatMessages, cleanupIdleSessions } from '@/lib/maintenance';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(expectedSecret);

  if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    expiredOrders: 0,
    deletedMessages: 0,
    deletedSessions: 0,
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

  console.log(`[Maintenance] expired=${results.expiredOrders} deletedMsg=${results.deletedMessages} deletedSession=${results.deletedSessions}`);
  return NextResponse.json({ success: true });
}
