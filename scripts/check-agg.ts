import { prisma } from '../src/lib/prisma';
import { isSubscriptionSource, isCompletedSource, beijingDayStart } from '../src/lib/aggregation';

const DAY_MS = 24 * 3600_000;

(async () => {
  const mentorId = 'lydiachen';
  const range = 90;
  const todayStart = beijingDayStart(new Date());
  const rangeStart = new Date(todayStart.getTime() - (range - 1) * DAY_MS);
  const tomorrow = new Date(todayStart.getTime() + DAY_MS);

  const mentorSessions = await prisma.chatSession.findMany({
    where: { mentorId },
    select: { id: true, userId: true, user: { select: { userGroup: true } } },
  });

  const sessionIds = mentorSessions.map((s) => s.id);
  const messages = await prisma.chatMessage.findMany({
    where: { chatSessionId: { in: sessionIds }, role: 'assistant' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, entitlementSource: true, chatSessionId: true },
  });

  const sessionById = new Map(mentorSessions.map((s) => [s.id, s]));

  const rounds = {
    total: 0,
    freeTrial: 0,
    subscription: 0,
    subscriptionMonthly: 0,
    subscriptionQuarterly: 0,
    subscriptionYearly: 0,
    subscriptionUnknown: 0,
    creditPack: 0,
  };

  let outOfRange = 0;

  for (const m of messages) {
    const sess = sessionById.get(m.chatSessionId);
    if (!sess || sess.user.userGroup !== 'NORMAL') continue;

    const inRangeNow = m.createdAt >= rangeStart && m.createdAt < tomorrow;
    const src = m.entitlementSource;

    if (inRangeNow && isCompletedSource(src)) {
      rounds.total++;
      if (src === 'FREE_TRIAL') rounds.freeTrial++;
      if (src === 'CREDIT_PACK') rounds.creditPack++;
      if (isSubscriptionSource(src)) {
        rounds.subscription++;
        if (src === 'SUBSCRIPTION_MONTHLY') rounds.subscriptionMonthly++;
        else if (src === 'SUBSCRIPTION_QUARTERLY') rounds.subscriptionQuarterly++;
        else if (src === 'SUBSCRIPTION_YEARLY') rounds.subscriptionYearly++;
        else if (src === 'SUBSCRIPTION') rounds.subscriptionUnknown++;
      }
    } else if (!inRangeNow) {
      outOfRange++;
    }
  }

  console.log('Total messages:', messages.length);
  console.log('Out of range:', outOfRange);
  console.log('rangeStart:', rangeStart.toISOString());
  console.log('tomorrow:', tomorrow.toISOString());
  console.log('Earliest msg:', messages[0]?.createdAt.toISOString());
  console.log('Latest msg:', messages[messages.length - 1]?.createdAt.toISOString());
  console.log('\nRounds:');
  console.log(JSON.stringify(rounds, null, 2));
  console.log('\nSum of tiers:', rounds.subscriptionMonthly + rounds.subscriptionQuarterly + rounds.subscriptionYearly + rounds.subscriptionUnknown);
  console.log('Subscription total:', rounds.subscription);

  await prisma.$disconnect();
})();
