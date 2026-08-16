/**
 * Prisma Client 单例
 * 确保在开发环境（热重载）下不会创建过多数据库连接
 *
 * P0 修复: 运行时自动种子 — 首次连接时检查并创建测试账号
 * 解决 Docker standalone 构建中种子脚本可能未执行的问题
 */
import { PrismaClient } from '@/generated/prisma';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ========================================
// 运行时自动种子 — 确保测试账号存在
// ========================================
let seedPromise: Promise<void> | null = null;

async function ensureTestAccounts() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      // 检查是否已有测试账号
      const count = await prisma.user.count({
        where: {
          OR: [
            { phone: '13821668570' },
            { phone: '13821668571' },
            { email: 't@t.com' },
          ],
        },
      });

      if (count >= 3) {
        console.log('[Seed] 测试账号已存在，跳过');
        return;
      }

      console.log('[Seed] 测试账号不存在，开始创建...');

      // 动态导入 bcryptjs（避免 Edge Runtime 问题）
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash('12345678', 12);

      // 清理可能存在的旧测试账号
      await prisma.user.deleteMany({
        where: {
          OR: [
            { phone: { in: ['13800000001', '13800000002', '13821668570', '13821668571'] } },
            { email: { in: ['t1@aiccompanion.com', 't2@aiccompanion.com', 't@t.com'] } },
          ],
        },
      }).catch(() => {});

      // 手机(免费)
      await prisma.user.create({
        data: {
          phone: '13821668570',
          email: 't1@aiccompanion.com',
          name: '测试手机(免费)',
          passwordHash,
          isPremium: false,
          freeTrialUsed: 0,
          profile: { create: {} },
        },
      }).catch(() => {});

      // 邮箱(免费)
      await prisma.user.create({
        data: {
          email: 't@t.com',
          name: '测试邮箱(免费)',
          passwordHash,
          isPremium: false,
          freeTrialUsed: 0,
          profile: { create: {} },
        },
      }).catch(() => {});

      // 手机(会员)
      const premiumUser = await prisma.user.create({
        data: {
          phone: '13821668571',
          email: 't2@aiccompanion.com',
          name: '测试手机(会员)',
          passwordHash,
          isPremium: true,
          freeTrialUsed: 0,
          profile: { create: {} },
        },
      }).catch(() => null);

      if (premiumUser) {
        await prisma.subscription.create({
          data: {
            userId: premiumUser.id,
            plan: 'MONTHLY',
            status: 'ACTIVE',
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }).catch(() => {});
      }

      console.log('[Seed] 测试账号创建完成');
    } catch (error) {
      console.error('[Seed] 自动种子失败:', error);
      // 重置 seedPromise 允许下次重试
      seedPromise = null;
    }
  })();
  return seedPromise;
}

// 在生产环境启动时自动执行种子检查
if (process.env.NODE_ENV === 'production') {
  ensureTestAccounts();
}

export { ensureTestAccounts };
