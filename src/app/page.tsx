import { Header } from '@/components/header';
import { HomeContent } from '@/components/home-content';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export default async function HomePage() {
  const session = await auth();

  let userInfo: { identifier: string; subscriptionEndDate: string | null } | null = null;

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, email: true, isPremium: true },
    });

    if (user) {
      let subscriptionEndDate: string | null = null;
      if (user.isPremium) {
        const subscription = await prisma.subscription.findFirst({
          where: { userId: session.user.id, status: 'ACTIVE' },
          orderBy: { endDate: 'desc' },
          select: { endDate: true },
        });
        if (subscription?.endDate) {
          subscriptionEndDate = subscription.endDate.toISOString().split('T')[0];
        }
      }
      userInfo = {
        identifier: user.phone || user.email || '',
        subscriptionEndDate,
      };
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <HomeContent
        isLoggedIn={!!session?.user}
        isPremium={!!session?.user?.isPremium}
        userInfo={userInfo}
      />
    </div>
  );
}
