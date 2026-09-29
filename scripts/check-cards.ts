import { prisma } from '../src/lib/prisma';

async function main() {
  const all = await prisma.mentorKnowledgeCard.count({ where: { knowledgeClass: 'external_approved' } });
  const cases = await prisma.mentorKnowledgeCard.count({ where: { knowledgeClass: 'external_approved', caseText: { not: null } } });
  const byMentor = await prisma.mentorKnowledgeCard.groupBy({
    by: ['mentorId'],
    where: { knowledgeClass: 'external_approved' },
    _count: { _all: true },
  });
  console.log(`知识卡总数: ${all}, 其中案例卡: ${cases}`);
  console.log('按导师:', byMentor);
}
main().catch(console.error).finally(() => prisma.$disconnect());
