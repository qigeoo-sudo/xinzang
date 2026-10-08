import { PrismaClient } from '../src/generated/prisma';

async function main() {
  const p = new PrismaClient();
  const groups = await p.mentorKnowledgeCard.groupBy({
    by: ['mentorId'],
    _count: { _all: true },
    orderBy: { _count: { mentorId: 'desc' } },
  });
  console.log('mentorId groups:', groups.length);
  for (const g of groups) console.log(g.mentorId, g._count._all);
  const total = await p.mentorKnowledgeCard.count();
  console.log('total', total);
  await p.$disconnect();
}

main().catch(console.error);
