/**
 * 数据库种子脚本
 * 运行: npm run db:seed
 *
 * 创建测试用户和基础数据
 */
import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始数据库种子初始化...');

  // 1. 创建管理员用户
  const adminPassword = await bcrypt.hash('Admin@2026', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@aicareer.com' },
    update: {},
    create: {
      email: 'admin@aicareer.com',
      name: '系统管理员',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isPremium: true,
      profile: {
        create: {
          major: '计算机科学',
        },
      },
    },
  });
  console.log(`  ✅ 管理员用户: ${admin.email}`);

  // 2. 创建测试普通用户
  const userPassword = await bcrypt.hash('Test@1234', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@aicareer.com' },
    update: {},
    create: {
      email: 'test@aicareer.com',
      name: '测试用户',
      passwordHash: userPassword,
      role: 'USER',
      freeTrialUsed: 0,
      profile: {
        create: {
          major: '计算机科学',
          interests: JSON.stringify(['互联网', 'AI', '创业']),
          goals: '找到适合的职业方向',
        },
      },
    },
  });
  console.log(`  ✅ 测试用户: ${testUser.email}`);

  // 3. 创建测试付费用户
  const premiumUser = await prisma.user.upsert({
    where: { email: 'premium@aicareer.com' },
    update: {},
    create: {
      email: 'premium@aicareer.com',
      name: '付费会员',
      passwordHash: userPassword,
      role: 'USER',
      isPremium: true,
      profile: {
        create: {
          major: '市场营销',
        },
      },
    },
  });

  // 为付费用户创建订阅记录
  const existingSub = await prisma.subscription.findFirst({
    where: { userId: premiumUser.id },
  });
  if (!existingSub) {
    const paymentOrder = await prisma.paymentOrder.create({
      data: {
        userId: premiumUser.id,
        orderNo: `SEED_${Date.now()}`,
        amount: 29.9,
        status: 'PAID',
        paymentMethod: 'wechat',
        paymentType: 'SUBSCRIPTION',
        paidAt: new Date(),
      },
    });

    await prisma.subscription.create({
      data: {
        userId: premiumUser.id,
        plan: 'MONTHLY',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentOrderId: paymentOrder.id,
      },
    });
  }
  console.log(`  ✅ 付费用户: ${premiumUser.email} (含订阅记录)`);

  // 4. 创建测试聊天会话
  const existingChat = await prisma.chatSession.findFirst({
    where: { userId: testUser.id },
  });
  if (!existingChat) {
    const chatSession = await prisma.chatSession.create({
      data: {
        userId: testUser.id,
        mentorId: 'lydia',
        title: '职业方向探索',
        messages: {
          create: [
            {
              role: 'user',
              content: '我最近很迷茫，不知道该选什么方向',
            },
            {
              role: 'assistant',
              content:
                '我理解你的感受。迷茫是职业探索中很正常的一个阶段。能告诉我你目前的专业和感兴趣的方向吗？',
              modelUsed: 'deepseek-chat',
            },
          ],
        },
      },
    });
    console.log(`  ✅ 测试聊天会话: ${chatSession.id}`);
  }

  console.log('\n✨ 数据库种子初始化完成！');
  console.log('\n📋 测试账号:');
  console.log('  管理员: admin@aicareer.com / Admin@2026');
  console.log('  普通用户: test@aicareer.com / Test@1234');
  console.log('  付费会员: premium@aicareer.com / Test@1234');
}

main()
  .catch((e) => {
    console.error('❌ 种子初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
