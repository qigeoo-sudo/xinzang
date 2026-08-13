/**
 * 支付订单 API
 * POST   /api/payment/orders        — 创建支付订单
 * GET    /api/payment/orders        — 获取用户订单列表
 * GET    /api/payment/orders/[id]   — 查询单个订单状态
 * POST   /api/payment/mock-pay      — Mock 支付 (开发环境)
 *
 * 修复安全审计 A09-9.1: 支付密钥服务端管理
 * 修复安全审计 A01-1.3: 需要身份验证
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { getPlanById } from '@/lib/plans';
import { generateOrderNo, createWxPayOrder } from '@/lib/wxpay';

/**
 * POST /api/payment/orders
 * 创建支付订单 + 调用微信支付下单
 *
 * Body: { planId: "MONTHLY" | "QUARTERLY" | "YEARLY" }
 */
export async function POST(request: NextRequest) {
  // 1. 身份验证
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  // 2. 速率限制
  const rateCheck = rateLimit(`payment-create:${session.user.id}`, 5, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: '操作过于频繁，请稍后再试' },
      { status: 429 }
    );
  }

  try {
    const { planId } = await request.json();

    // 3. 验证计划 ID
    const plan = getPlanById(planId);
    if (!plan) {
      return NextResponse.json(
        { error: '无效的订阅计划' },
        { status: 400 }
      );
    }

    // 4. 检查是否已有有效订阅 — 允许升级但不允许降级
    const existingSub = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
        endDate: { gt: new Date() },
      },
    });

    if (existingSub) {
      // 套餐等级判断
      const planRank: Record<string, number> = {
        MONTHLY: 1,
        QUARTERLY: 2,
        YEARLY: 3,
      };
      const currentRank = planRank[existingSub.plan] || 0;
      const newRank = planRank[plan.id] || 0;

      // 不允许降级或同级重复订阅
      if (newRank <= currentRank) {
        return NextResponse.json(
          { error: '你已有同级或更高级会员，无需重复订阅' },
          { status: 400 }
        );
      }
      // 允许升级：将旧订阅标记为已升级 (不取消，保留到期)
      // 新订阅会在支付成功后创建
    }

    // 5. 创建业务订单号
    const orderNo = generateOrderNo();
    const clientIP = getClientIP(request);

    // 6. 调用微信支付下单
    const wxPayResult = await createWxPayOrder({
      orderNo,
      amount: plan.priceFen,
      description: `AI职业导师-${plan.name}`,
      clientIP,
      userId: session.user.id,
    });

    if (!wxPayResult.success) {
      return NextResponse.json(
        { error: wxPayResult.error || '支付下单失败' },
        { status: 500 }
      );
    }

    // 7. 创建数据库订单记录
    const order = await prisma.paymentOrder.create({
      data: {
        userId: session.user.id,
        orderNo,
        amount: plan.price,
        currency: 'CNY',
        status: 'PENDING',
        paymentMethod: 'wechat',
        paymentType: 'SUBSCRIPTION',
        expiredAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
        metadata: JSON.stringify({
          planId: plan.id,
          planName: plan.name,
          durationDays: plan.durationDays,
          mockPayment: wxPayResult.mock || false,
        }),
      },
    });

    // 8. 返回支付信息
    return NextResponse.json({
      orderId: order.id,
      orderNo: order.orderNo,
      amount: plan.price,
      planName: plan.name,
      payUrl: wxPayResult.payUrl,
      mock: wxPayResult.mock || false,
      expiredAt: order.expiredAt,
    }, { status: 201 });
  } catch (error) {
    console.error('Create payment order error:', error);
    return NextResponse.json(
      { error: '创建订单失败，请稍后再试' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payment/orders
 * 获取用户订单列表
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const orders = await prisma.paymentOrder.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      orderNo: true,
      amount: true,
      status: true,
      paymentType: true,
      paidAt: true,
      createdAt: true,
      metadata: true,
    },
  });

  return NextResponse.json({ orders });
}
