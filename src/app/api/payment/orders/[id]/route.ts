/**
 * 订单状态查询 API
 * GET /api/payment/orders/[id] — 查询单个订单状态
 *
 * 用于前端轮询支付结果
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { queryWxPayOrder, isMockMode } from '@/lib/wxpay';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  // 获取订单并验证归属
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      orderNo: true,
      amount: true,
      status: true,
      paymentMethod: true,
      paidAt: true,
      expiredAt: true,
      createdAt: true,
      metadata: true,
      userId: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: '订单不存在' }, { status: 404 });
  }

  // 安全检查: 只能查看自己的订单
  if (order.userId !== session.user.id) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  // 如果订单仍为 PENDING 且未过期，主动查询微信支付状态
  if (
    order.status === 'PENDING' &&
    order.expiredAt &&
    order.expiredAt > new Date() &&
    !isMockMode
  ) {
    const wxResult = await queryWxPayOrder(order.orderNo);

    if (wxResult.status === 'PAID') {
      // 微信已支付但回调未到达，主动更新
      await handlePaymentSuccess(order.orderNo, wxResult.transactionId);
      return NextResponse.json({
        ...order,
        status: 'PAID',
        transactionId: wxResult.transactionId,
      });
    }
  }

  // Mock 模式下订单状态由 mock-pay API 更新
  return NextResponse.json({
    id: order.id,
    orderNo: order.orderNo,
    amount: order.amount,
    status: order.status,
    paidAt: order.paidAt,
    expiredAt: order.expiredAt,
    createdAt: order.createdAt,
  });
}

/**
 * 支付成功处理 — 创建订阅 + 更新用户会员状态
 */
async function handlePaymentSuccess(
  orderNo: string,
  transactionId?: string
): Promise<void> {
  const order = await prisma.paymentOrder.findUnique({
    where: { orderNo },
  });

  if (!order || order.status !== 'PENDING') return;

  // 解析订单元数据获取计划信息
  const metadata = order.metadata ? JSON.parse(order.metadata) : {};
  const planId = metadata.planId || 'MONTHLY';
  const durationDays = metadata.durationDays || 30;

  // 事务: 更新订单 + 创建订阅 + 更新用户会员状态
  await prisma.$transaction([
    // 1. 更新订单状态
    prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        transactionId,
        paidAt: new Date(),
      },
    }),
    // 2. 创建订阅记录
    prisma.subscription.create({
      data: {
        userId: order.userId,
        plan: planId,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
        paymentOrderId: order.id,
      },
    }),
    // 3. 更新用户会员状态
    prisma.user.update({
      where: { id: order.userId },
      data: { isPremium: true },
    }),
  ]);
}
