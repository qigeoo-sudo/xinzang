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
import { getPlanById, getCreditPackById, calcCreditPackPriceFen, CREDIT_PACK_MAX_QTY, YEARLY_RENEWAL_CAP_DAYS, CREDIT_PACK_MAX_BALANCE } from '@/lib/plans';
import { generateOrderNo, createWxPayOrder } from '@/lib/wxpay';
import { createAlipayOrder } from '@/lib/alipay';
import { z } from 'zod';

/** 支付方式 */
type PaymentMethod = 'wechat' | 'alipay';

/** 创建订单 Schema */
const createOrderSchema = z.object({
  planId: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY', 'CREDIT_10']),
  paymentMethod: z.enum(['wechat', 'alipay']).default('wechat'),
  isRenewal: z.boolean().default(false),
  // 多榨卡可一次购买多个（批量折扣）；会员套餐恒为 1
  quantity: z.number().int().min(1).max(CREDIT_PACK_MAX_QTY).default(1),
});

/**
 * POST /api/payment/orders
 * 创建支付订单 + 调用支付下单 (微信支付 / 支付宝)
 *
 * Body: { planId: "MONTHLY" | "QUARTERLY" | "YEARLY" | "CREDIT_10", paymentMethod?: "wechat" | "alipay" }
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

    const { planId, paymentMethod } = parsed.data;

    // 3. 识别商品：多榨卡 或 会员订阅
    const creditPack = getCreditPackById(planId);
    const plan = creditPack ? undefined : getPlanById(planId);

    // 数量只对多榨卡生效；会员套餐恒为 1，忽略客户端传值
    const quantity = creditPack ? parsed.data.quantity : 1;

    if (!creditPack && !plan) {
      return NextResponse.json(
        { error: '无效的商品' },
        { status: 400 }
      );
    }

    // 4. 会员订阅：校验升级/续费等级（多榨卡任何人可重复购买）
    let existingSub: Awaited<ReturnType<typeof prisma.subscription.findFirst>> = null;
    if (plan) {
      existingSub = await prisma.subscription.findFirst({
        where: {
          userId: session.user.id,
          status: 'ACTIVE',
          endDate: { gt: new Date() },
        },
      });

      if (existingSub) {
        const planRank: Record<string, number> = {
          MONTHLY: 1,
          QUARTERLY: 2,
          YEARLY: 3,
        };
        const currentRank = planRank[existingSub.plan] || 0;
        const newRank = planRank[plan.id] || 0;
        const isSamePlanRenewal = existingSub.plan === plan.id;

        // 同级仅允许年度续费；低级/同级重复订阅一律拒绝
        if (newRank < currentRank || (newRank === currentRank && !isSamePlanRenewal)) {
          return NextResponse.json(
            { error: '你已有同级或更高级会员，无需重复订阅' },
            { status: 400 }
          );
        }

        // 年卡续费上限：来自年卡的剩余天数 > 1460 天（4 年）时不可再续；
        // 正好 1460 天仍可续一年（续后 1825 天），之后需等消耗回落
        if (isSamePlanRenewal && plan.id === 'YEARLY') {
          const daysRemaining = Math.ceil(
            (existingSub.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          );
          if (daysRemaining > YEARLY_RENEWAL_CAP_DAYS) {
            return NextResponse.json(
              { error: '年卡剩余时长已超过 4 年，暂无法续费，待剩余天数回落至 1460 天内可再续' },
              { status: 400 }
            );
          }
        }
      }
    }

    // 多榨卡持有上限：当前余额 + 本次轮次 > 2970 时拒绝下单
    if (creditPack) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { mentorCredits: true, mentorCreditsConsumed: true },
      });
      const creditBalance = Math.max(
        0,
        (dbUser?.mentorCredits ?? 0) - (dbUser?.mentorCreditsConsumed ?? 0)
      );
      if (creditBalance + creditPack.credits * quantity > CREDIT_PACK_MAX_BALANCE) {
        return NextResponse.json(
          { error: `多榨卡持有轮次已达 ${CREDIT_PACK_MAX_BALANCE} 轮上限，消耗后可再购买` },
          { status: 400 }
        );
      }
    }

    // 5. 价格 — 多榨卡按数量与批量折扣服务端重算（不信任客户端价格）
    const actualPriceFen = creditPack
      ? calcCreditPackPriceFen(creditPack, quantity)
      : plan!.priceFen;
    const actualPrice = Number((actualPriceFen / 100).toFixed(2));
    const totalCredits = creditPack ? creditPack.credits * quantity : 0;
    const productName = creditPack
      ? `多榨卡 ${totalCredits}轮次${quantity > 1 ? `（${quantity}包）` : ''}`
      : plan!.name;
    const paymentType = creditPack ? 'CREDIT_PACK' : 'SUBSCRIPTION';

    // 6. 创建业务订单号
    const orderNo = generateOrderNo();
    const clientIP = getClientIP(request);

    // 7. 调用支付下单 — 根据 paymentMethod 调用对应支付渠道
    const orderParams = {
      orderNo,
      amount: actualPriceFen,
      description: `AI职业导师-${productName}`,
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
        paymentType,
        expiredAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
        metadata: JSON.stringify(
          creditPack
            ? {
                planId: creditPack.id,
                planName: productName,
                credits: totalCredits,
                quantity,
                unitCredits: creditPack.credits,
                mockPayment: payResult.mock || false,
              }
            : {
                planId: plan!.id,
                planName: plan!.name,
                mockPayment: payResult.mock || false,
              }
        ),
      },
    });

    // 9. 返回支付信息 (包含 paymentMethod)
    return NextResponse.json({
      orderId: order.id,
      orderNo: order.orderNo,
      amount: actualPrice,
      planName: productName,
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
  const { allowed } = rateLimit(`orders-list-${ip}`, 10, 60000);
  if (!allowed) {
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
