/**
 * 一次性：清掉本地 dev 库的 ying-pilot 卡，恢复 S21 回归测试的规范基线。
 * 测试端 xinzang_test 的 92 张不受影响（activate 段已灌好）。
 */
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const del = await prisma.mentorKnowledgeCard.deleteMany({ where: { mentorId: 'ying-pilot' } });
  const total = await prisma.mentorKnowledgeCard.count();
  console.log(`本地库已删 ying-pilot 卡 ${del.count} 张；剩余总数 ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
