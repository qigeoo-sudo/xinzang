/**
 * 维护任务 — 支付订单过期 + 聊天历史清理
 */
import { prisma } from '@/lib/prisma';

/**
 * 将超时未支付的 PaymentOrder 标记为 EXPIRED
 */
export async function expirePendingOrders(): Promise<number> {
  const result = await prisma.paymentOrder.updateMany({
    where: {
      status: 'PENDING',
      expiredAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

/**
 * 清理超过套餐保留天数的聊天消息
 */
export async function cleanupOldChatMessages(): Promise<number> {
  const defaultRetentionDays = 90;
  const retentionDays = parseInt(process.env.CHAT_HISTORY_RETENTION_DAYS || String(defaultRetentionDays), 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await prisma.chatMessage.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * 清理无消息的空闲会话（30天以上）
 */
export async function cleanupIdleSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await prisma.chatSession.deleteMany({
    where: {
      messageCount: 0,
      createdAt: { lt: cutoff },
    },
  });
  return result.count;
}
