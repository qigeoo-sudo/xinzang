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
import { createAlipayOrder } from '@/lib/alipay';
import { z } from 'zod';

/** 支付方式 */
type PaymentMethod = 'wechat' | 'alipay';

/** 创建订单 Schema — 修复: isRenewal 纳入 Zod 校验 */
const createOrderSchema = z.object({
  planId: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  paymentMethod: z.enum(['wechat', 'alipay']).default('wechat'),
  isRenewal: z.boolean().default(false),
});

/**
 * POST /api/payment/orders
 * 创建支付订单 + 调用支付下单 (微信支付 / 支付宝)
 *
 * Body: { planId: "MONTHLY" | "QUARTERLY" | "YEARLY", paymentMethod?: "wechat" | "alipay" }
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
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const { planId, paymentMethod, isRenewal } = parsed.data;

    // 3. 验证计划 ID
    const plan = getPlanById(planId);
    if (!plan) {
      return NextResponse.json(
        { error: '无效的订阅计划' },
        { status: 400 }
      );
    }

    // 5. 检查是否已有有效订阅
    const existingSub = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
        endDate: { gt: new Date() },
      },
    });

    // 续费折扣：年度会员续费年度享8折
    const isYearlyRenewal = isRenewal && plan.id === 'YEARLY' && existingSub?.plan === 'YEARLY';
    const discountRate = isYearlyRenewal ? 0.8 : 1;
    const actualPriceFen = Math.round(plan.priceFen * discountRate);
    const actualPrice = Math.round(actualPriceFen / 100) + (actualPriceFen % 100) / 100;

    if (existingSub) {
      if (isYearlyRenewal) {
        // 年度续费：允许
      } else {
        // 套餐等级判断
        const planRank: Record<string, number> = {
          MONTHLY: 1,
          QUARTERLY: 2,
          YEARLY: 3,
        };
        const currentRank = planRank[existingSub.plan] || 0;
        const newRank = planRank[plan.id] || 0;

        // 不允许降级或同级重复订阅（非续费）
        if (newRank <= currentRank) {
          return NextResponse.json(
            { error: '你已有同级或更高级会员，无需重复订阅' },
            { status: 400 }
          );
        }
      }
    }

    // 6. 创建业务订单号
    const orderNo = generateOrderNo();
    const clientIP = getClientIP(request);

    // 7. 调用支付下单 — 根据 paymentMethod 调用对应支付渠道
    const orderParams = {
      orderNo,
      amount: actualPriceFen,
      description: isYearlyRenewal ? `AI职业导师-${plan.name}续费(8折)` : `AI职业导师-${plan.name}`,
      clientIP,
      userId: session.user.id,
    };

    const payResult =
      paymentMethod === 'alipay'
        ? await createAlipayOrder(orderParams)
        : await createWxPayOrder(orderParams);

    if (!payResult.success) {
      return NextResponse.json(
        { error: payResult.error || '支付下单失败' },
        { status: 500 }
      );
    }

    // 8. 创建数据库订单记录 (写入实际 paymentMethod)
    const order = await prisma.paymentOrder.create({
      data: {
        userId: session.user.id,
        orderNo,
        amount: actualPrice,
        currency: 'CNY',
        status: 'PENDING',
        paymentMethod,
        paymentType: 'SUBSCRIPTION',
        expiredAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
        metadata: JSON.stringify({
          planId: plan.id,
          planName: plan.name,
          durationDays: plan.durationDays,
          mockPayment: payResult.mock || false,
          isRenewal: isYearlyRenewal,
          originalPrice: plan.price,
          discountRate,
        }),
      },
    });

    // 9. 返回支付信息 (包含 paymentMethod)
    return NextResponse.json({
      orderId: order.id,
      orderNo: order.orderNo,
      amount: actualPrice,
      planName: plan.name,
      paymentMethod,
      payUrl: payResult.payUrl,
      mock: payResult.mock || false,
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
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const ip = getClientIP(request);
  const { success } = rateLimit(`orders-list-${ip}`, 10, 60000);
  if (!success) {
    return NextResponse.json({ error: '请求过于频繁' }, { status: 429 });
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
