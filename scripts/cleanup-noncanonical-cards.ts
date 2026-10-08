import { PrismaClient } from '../src/generated/prisma';
import { CANONICAL_MENTOR_IDS } from '../src/lib/kb-governance';

async function main() {
  const p = new PrismaClient();
  const result = await p.mentorKnowledgeCard.deleteMany({
    where: { mentorId: { notIn: [...CANONICAL_MENTOR_IDS] } },
  });
  console.log(`deleted ${result.count} non-canonical cards`);
  const total = await p.mentorKnowledgeCard.count();
  console.log('remaining total', total);
  await p.$disconnect();
}

main().catch(console.error);
