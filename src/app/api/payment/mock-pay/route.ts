/**
 * Mock 支付 API — 仅开发环境使用
 * POST /api/payment/mock-pay
 *
 * 模拟微信支付回调，用于本地开发测试完整支付流程
 * 生产环境自动禁用
 *
 * Body: { orderNo: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { isMockMode } from '@/lib/wxpay';
import { fulfillPaidOrder } from '@/lib/payment-fulfillment';

export async function POST(request: NextRequest) {
  // 生产环境禁用
  if (!isMockMode) {
    return NextResponse.json(
      { error: 'Mock 支付仅在开发环境可用' },
      { status: 403 }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  try {
    const { orderNo } = await request.json();

    if (!orderNo) {
      return NextResponse.json(
        { error: '缺少 orderNo' },
        { status: 400 }
      );
    }

    // 查找订单并校验归属
    const order = await prisma.paymentOrder.findUnique({
      where: { orderNo },
    });

    if (!order) {
      return NextResponse.json(
        { error: '订单不存在' },
        { status: 404 }
      );
    }

    if (order.userId !== session.user.id) {
      return NextResponse.json({ error: '无权操作此订单' }, { status: 403 });
    }

    if (order.status === 'PAID') {
      return NextResponse.json({ message: '订单已支付', order });
    }

    if (order.status === 'EXPIRED' || (order.expiredAt && order.expiredAt < new Date())) {
      return NextResponse.json(
        { error: '订单已过期' },
        { status: 400 }
      );
    }

    // 非 PENDING 状态不允许 Mock 支付
    if (order.status !== 'PENDING') {
      return NextResponse.json(
        { error: `订单状态为 ${order.status}，无法支付` },
        { status: 400 }
      );
    }

    // 模拟支付成功：走与微信/支付宝回调一致的统一履约逻辑
    const mockTransactionId = `mock_tx_${Date.now()}`;
    const result = await fulfillPaidOrder(orderNo, mockTransactionId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Mock 支付成功',
      orderNo,
      transactionId: mockTransactionId,
    });
  } catch (error) {
    console.error('Mock payment error:', error);
    return NextResponse.json(
      { error: 'Mock 支付失败' },
      { status: 500 }
    );
  }
}
