/**
 * 测试用户种子脚本 — CloudBase 部署后运行一次即可
 *
 * 用途: 在生产数据库中预置测试账号，用于登录和功能验证
 * 运行: npx tsx prisma/seed-test-users.ts
 *   或: npx prisma db execute --file prisma/seed-test-users.ts
 *
 * 测试账号:
 * - 手机: 13800000001 / 密码: test1234
 * - 邮箱: test@aiccompanion.com / 密码: test1234
 *
 * 注意: 密码哈希使用 bcrypt，与注册流程一致
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('test1234', 12);

  // 测试手机号用户
  const phoneUser = await prisma.user.upsert({
    where: { phone: '13800000001' },
    update: { passwordHash },
    create: {
      phone: '13800000001',
      email: 'test-phone@aiccompanion.com',
      name: '测试用户(手机)',
      passwordHash,
      role: 'USER',
      isPremium: false,
      freeTrialUsed: 0,
      profile: { create: {} },
    },
  });
  console.log('✅ 手机测试用户已创建/更新:', phoneUser.phone, 'ID:', phoneUser.id);

  // 测试邮箱用户
  const emailUser = await prisma.user.upsert({
    where: { email: 'test@aiccompanion.com' },
    update: { passwordHash },
    create: {
      email: 'test@aiccompanion.com',
      phone: null,
      name: '测试用户(邮箱)',
      passwordHash,
      role: 'USER',
      isPremium: false,
      freeTrialUsed: 0,
      profile: { create: {} },
    },
  });
  console.log('✅ 邮箱测试用户已创建/更新:', emailUser.email, 'ID:', emailUser.id);

  // 会员测试用户（已开通月度会员）
  const premiumHash = await bcrypt.hash('premium1234', 12);
  const premiumUser = await prisma.user.upsert({
    where: { phone: '13800000002' },
    update: { passwordHash: premiumHash, isPremium: true },
    create: {
      phone: '13800000002',
      email: 'premium@aiccompanion.com',
      name: '会员测试用户',
      passwordHash: premiumHash,
      role: 'USER',
      isPremium: true,
      freeTrialUsed: 0,
      profile: { create: {} },
    },
  });

  // 为会员用户创建有效订阅
  const existingSub = await prisma.subscription.findFirst({
    where: { userId: premiumUser.id, status: 'ACTIVE' },
  });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        userId: premiumUser.id,
        plan: 'MONTHLY',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log('✅ 会员测试用户已创建/更新:', premiumUser.phone, 'ID:', premiumUser.id);

  console.log('\n📋 测试账号汇总:');
  console.log('┌──────────┬─────────────────────────┬────────────┐');
  console.log('│ 类型     │ 账号                     │ 密码       │');
  console.log('├──────────┼─────────────────────────┼────────────┤');
  console.log('│ 手机(免) │ 13800000001              │ test1234   │');
  console.log('│ 邮箱(免) │ test@aiccompanion.com    │ test1234   │');
  console.log('│ 手机(会员)│ 13800000002             │ premium1234│');
  console.log('└──────────┴─────────────────────────┴────────────┘');
  console.log('\n💡 Mock 支付: 不需要验证码，点击"确认支付(模拟)"即可');
}

main()
  .catch((e) => {
    console.error('❌ 种子脚本失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
