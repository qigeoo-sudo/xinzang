import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/header';
import Link from 'next/link';

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: { orderNo?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  // 查询订单
  const order = searchParams.orderNo
    ? await prisma.paymentOrder.findUnique({
        where: { orderNo: searchParams.orderNo },
        select: {
          orderNo: true,
          amount: true,
          status: true,
          paidAt: true,
          paymentMethod: true,
          metadata: true,
        },
      })
    : null;

  // 查询订阅
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: session.user.id,
      status: 'ACTIVE',
    },
    orderBy: { endDate: 'desc' },
    select: {
      plan: true,
      startDate: true,
      endDate: true,
    },
  });

  const planNames: Record<string, string> = {
    MONTHLY: '月度会员',
    QUARTERLY: '季度会员',
    YEARLY: '年度会员',
  };

  const metadata = order?.metadata ? JSON.parse(order.metadata) : {};

  return (
    <div className="min-h-screen flex flex-col bg-beige">
      <Header />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* 成功图标 */}
          <div className="text-center mb-6 animate-slide-up">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="#5B8C5A"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-ink mb-2">支付成功</h1>
            <p className="text-sm text-muted">会员已激活，享受全部权益</p>
          </div>

          {/* 订单信息 */}
          {order && (
            <div className="card mb-4">
              <h2 className="text-sm font-semibold text-ink mb-3">订单信息</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">订单号</span>
                  <span className="text-ink text-xs font-mono">
                    {order.orderNo}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">支付金额</span>
                  <span className="text-accent font-bold">
                    ￥{order.amount}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">支付方式</span>
                  <span className="text-ink">
                    {order.paymentMethod === 'wechat' ? '微信支付' : order.paymentMethod}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">支付时间</span>
                  <span className="text-ink text-xs">
                    {order.paidAt
                      ? new Date(order.paidAt).toLocaleString('zh-CN')
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">订阅方案</span>
                  <span className="text-ink">
                    {planNames[metadata.planId] || metadata.planName || '-'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 会员信息 */}
          {subscription && (
            <div className="card mb-4 bg-accent/5 border-accent/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2L2 7h20L12 2z M2 7v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7"
                      stroke="#5B7C5A"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold text-accent">
                  {planNames[subscription.plan]} 已激活
                </h2>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">开始时间</span>
                  <span className="text-ink">
                    {subscription.startDate.toLocaleDateString('zh-CN')}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">到期时间</span>
                  <span className="text-ink">
                    {subscription.endDate.toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="space-y-3">
            <Link href="/mentors" className="btn-primary block text-center">
              开始与导师对话
            </Link>
            <Link
              href="/dashboard"
              className="btn-secondary block text-center"
            >
              返回我的档案
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
