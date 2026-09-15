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
import { fulfillPaidOrder } from '@/lib/payment-fulfillment';

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

    if (wxResult.status === 'PAID' && wxResult.amount) {
      // 微信已支付但回调未到达，主动更新 — 校验金额一致后才处理
      const expectedAmountFen = Math.round(Number(order.amount) * 100);
      if (wxResult.amount === expectedAmountFen) {
        // 委托 payment-fulfillment.ts 统一履约（幂等 + 并发保护 + 接续/加购处理 + 缓存失效）
        const result = await fulfillPaidOrder(
          order.orderNo,
          wxResult.transactionId || ''
        );
        if (result.success) {
          return NextResponse.json({
            ...order,
            status: 'PAID',
            transactionId: wxResult.transactionId,
          });
        }
        console.error(
          `Order ${order.orderNo}: fulfillPaidOrder failed`,
          result.error
        );
      } else {
        console.error(`Order ${order.orderNo}: amount mismatch on query (expected=${expectedAmountFen}, got=${wxResult.amount})`);
      }
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
