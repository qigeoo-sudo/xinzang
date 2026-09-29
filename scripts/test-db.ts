import { prisma } from '../src/lib/prisma';
async function main() {
  const c = await prisma.chatSession.count({ where: { mentorId: 'lydiachen' } });
  console.log('sessions:', c);
}
main().finally(() => prisma.$disconnect());
