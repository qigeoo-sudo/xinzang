/**
 * 一次性迁移脚本：role=ADMIN -> ADMIN_FULL
 * 迁移前先列出并备份管理员 ID；幂等：已是 ADMIN_FULL 的账号不受影响。
 * 用法：node --env-file=.env scripts/migrate-admin-role.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, phone: true, email: true, name: true },
  });

  console.log(`找到 ${admins.length} 个 ADMIN 账号（迁移前备份）：`);
  for (const a of admins) console.log(JSON.stringify(a));

  if (admins.length === 0) {
    console.log('无需迁移。');
    return;
  }

  const result = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { role: 'ADMIN_FULL' },
  });
  console.log(`已迁移 ${result.count} 个账号：ADMIN -> ADMIN_FULL`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
