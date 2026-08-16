/**
 * 测试用户种子脚本 — CloudBase 部署后运行一次即可
 *
 * 用途: 在生产数据库中预置测试账号，用于登录和功能验证
 * 运行: npx tsx prisma/seed-test-users.ts
 *
 * 测试账号（统一密码 12345678）:
 *
 * 手机(免费)
 * 13800000001
 * 密码 12345678
 *
 * 邮箱(免费)
 * t@t.com
 * 密码 12345678
 *
 * 手机(会员)
 * 13800000002
 * 密码 12345678
 *
 * 自动恢复: 测试账号被修改后（如免费→会员、月度→年度），
 * 5分钟后自动恢复初始状态，方便不同人体验。
 */
import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 统一密码
const TEST_PASSWORD = '12345678';

// 测试账号配置 — 同时被 src/lib/test-accounts.ts 引用
export const TEST_ACCOUNTS = [
  {
    phone: '13800000001',
    email: 't1@aiccompanion.com',
    name: '测试手机(免费)',
    isPremium: false,
    freeTrialUsed: 0,
    subscriptionPlan: null as string | null,
  },
  {
    phone: null,
    email: 't@t.com',
    name: '测试邮箱(免费)',
    isPremium: false,
    freeTrialUsed: 0,
    subscriptionPlan: null as string | null,
  },
  {
    phone: '13800000002',
    email: 't2@aiccompanion.com',
    name: '测试手机(会员)',
    isPremium: true,
    freeTrialUsed: 0,
    subscriptionPlan: 'MONTHLY' as string | null,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  for (const acc of TEST_ACCOUNTS) {
    // 通过 phone 或 email 查找已有用户
    let existing;
    if (acc.phone) {
      existing = await prisma.user.findUnique({ where: { phone: acc.phone } });
    } else if (acc.email) {
      existing = await prisma.user.findUnique({ where: { email: acc.email } });
    }

    if (existing) {
      // 更新已有用户 — 重置到初始状态
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name: acc.name,
          isPremium: acc.isPremium,
          freeTrialUsed: acc.freeTrialUsed,
        },
      });

      // 会员账号: 重置订阅为 MONTHLY
      if (acc.subscriptionPlan) {
        // 取消所有现有订阅
        await prisma.subscription.updateMany({
          where: { userId: existing.id, status: 'ACTIVE' },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        // 创建新的 MONTHLY 订阅
        await prisma.subscription.create({
          data: {
            userId: existing.id,
            plan: acc.subscriptionPlan,
            status: 'ACTIVE',
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      } else {
        // 免费账号: 取消所有订阅
        await prisma.subscription.updateMany({
          where: { userId: existing.id, status: { in: ['ACTIVE', 'UPGRADED'] } },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
      }

      console.log(`✅ 已重置: ${acc.phone || acc.email}`);
    } else {
      // 创建新用户
      const userData: any = {
        passwordHash,
        name: acc.name,
        isPremium: acc.isPremium,
        freeTrialUsed: acc.freeTrialUsed,
        profile: { create: {} },
      };

      if (acc.phone) {
        userData.phone = acc.phone;
        userData.email = acc.email;
      } else {
        userData.email = acc.email;
        userData.phone = null;
      }

      const user = await prisma.user.create({ data: userData });

      if (acc.subscriptionPlan) {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            plan: acc.subscriptionPlan,
            status: 'ACTIVE',
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }

      console.log(`✅ 已创建: ${acc.phone || acc.email}`);
    }
  }

  console.log('\n测试账号（统一密码 12345678）:');
  console.log('手机(免费): 13800000001');
  console.log('邮箱(免费): t@t.com');
  console.log('手机(会员): 13800000002');
}

main()
  .catch((e) => {
    console.error('❌ 种子脚本失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
