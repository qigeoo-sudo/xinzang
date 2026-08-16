/**
 * 测试账号自动恢复机制
 *
 * 原理: 测试账号被修改后（如免费→会员、月度→年度），
 * 5分钟后自动恢复初始状态，方便不同人体验。
 *
 * 实现: 在关键 API 入口（chat、auth）调用 resetTestAccountsIfNeeded()，
 * 检查测试账号的 updatedAt，超过5分钟且状态偏离初始值时自动重置。
 */

import { prisma } from '@/lib/prisma';

// 5分钟自动恢复间隔
const RESET_INTERVAL_MS = 5 * 60 * 1000;

// 测试账号标识符（phone 或 email）
const TEST_IDENTIFIERS = new Set([
  '13821668570', // 手机(免费)
  't@t.com',     // 邮箱(免费)
  '13821668571', // 手机(会员)
]);

// 测试账号初始状态
const INITIAL_STATES: Record<string, {
  isPremium: boolean;
  freeTrialUsed: number;
  subscriptionPlan: string | null;
}> = {
  '13821668570': { isPremium: false, freeTrialUsed: 0, subscriptionPlan: null },
  't@t.com':     { isPremium: false, freeTrialUsed: 0, subscriptionPlan: null },
  '13821668571': { isPremium: true,  freeTrialUsed: 0, subscriptionPlan: 'MONTHLY' },
};

/**
 * 判断用户是否为测试账号
 */
export function isTestAccount(identifier: string): boolean {
  return TEST_IDENTIFIERS.has(identifier);
}

/**
 * 检查并重置偏离初始状态的测试账号
 * 在关键 API 入口调用，5分钟后自动恢复
 *
 * @param userId 可选 — 只检查指定用户（性能优化）
 */
export async function resetTestAccountsIfNeeded(userId?: string) {
  try {
    // 查找测试账号
    const where = userId
      ? { id: userId }
      : {
          OR: [
            { phone: { in: [...TEST_IDENTIFIERS] } },
            { email: 't@t.com' },
          ],
        };

    const testUsers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        phone: true,
        email: true,
        isPremium: true,
        freeTrialUsed: true,
        updatedAt: true,
      },
    });

    const now = Date.now();

    for (const user of testUsers) {
      // 确定标识符
      const identifier = user.phone || user.email || '';
      if (!TEST_IDENTIFIERS.has(identifier)) continue;

      const initialState = INITIAL_STATES[identifier];
      if (!initialState) continue;

      // 检查 updatedAt 是否超过5分钟
      const elapsed = now - user.updatedAt.getTime();
      if (elapsed < RESET_INTERVAL_MS) continue;

      // 检查是否偏离初始状态
      const needsReset =
        user.isPremium !== initialState.isPremium ||
        user.freeTrialUsed !== initialState.freeTrialUsed;

      if (!needsReset) {
        // 用户状态没变，但仍需检查订阅是否偏离
        if (initialState.subscriptionPlan) {
          const sub = await prisma.subscription.findFirst({
            where: { userId: user.id, status: 'ACTIVE' },
            select: { plan: true },
          });
          if (sub?.plan !== initialState.subscriptionPlan) {
            // 订阅计划偏离 — 需要重置
          } else {
            continue; // 状态正常，跳过
          }
        } else {
          // 免费账号 — 检查是否有不该有的活跃订阅
          const activeSub = await prisma.subscription.findFirst({
            where: { userId: user.id, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!activeSub) continue; // 没有订阅，正常
        }
      }

      // 执行重置
      console.log(`[TestReset] 重置测试账号 ${identifier} 到初始状态`);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isPremium: initialState.isPremium,
          freeTrialUsed: initialState.freeTrialUsed,
        },
      });

      // 取消所有现有活跃订阅
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: { in: ['ACTIVE', 'UPGRADED'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      // 会员账号: 重新创建 MONTHLY 订阅
      if (initialState.subscriptionPlan) {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            plan: initialState.subscriptionPlan,
            status: 'ACTIVE',
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }
  } catch (error) {
    // 静默失败 — 不影响正常 API 流程
    console.error('[TestReset] Error:', error);
  }
}
