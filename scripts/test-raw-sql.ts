import { prisma, Prisma } from '../src/lib/prisma';

async function main() {
  const COMPLETED_SRC = "'FREE_TRIAL','CREDIT_PACK','SUBSCRIPTION','SUBSCRIPTION_MONTHLY','SUBSCRIPTION_QUARTERLY','SUBSCRIPTION_YEARLY'";
  const result = await prisma.$queryRaw`SELECT COUNT(DISTINCT cs.userId) AS c FROM ChatMessage cm JOIN ChatSession cs ON cm.chatSessionId = cs.id JOIN User u ON cs.userId = u.id WHERE cm.role = 'assistant' AND cm.entitlementSource IN (${Prisma.raw(COMPLETED_SRC)}) AND u.userGroup = 'NORMAL'` as unknown as { c: bigint }[];
  console.log('platform helped users:', Number(result[0].c));

  const [paidRow] = await prisma.$queryRaw`SELECT COUNT(DISTINCT userId) AS c FROM PaymentOrder WHERE status = 'PAID'` as unknown as { c: bigint }[];
  console.log('platform paid users:', Number(paidRow.c));
}

main().catch(console.error).finally(() => prisma.$disconnect());
