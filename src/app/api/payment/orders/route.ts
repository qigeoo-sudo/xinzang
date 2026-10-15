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
import { getPlanById, getSinglePlanById, getCreditPackById, parseAnyPlanId, calcCreditPackPriceFen, CREDIT_PACK_MAX_QTY, YEARLY_RENEWAL_CAP_DAYS, CREDIT_PACK_MAX_BALANCE } from '@/lib/plans';
import { getSubscriptionRoundsRemaining } from '@/lib/chat-quota';
import { getMentorById } from '@/lib/mentors';
import { generateOrderNo, createWxPayOrder } from '@/lib/wxpay';
import { createAlipayOrder } from '@/lib/alipay';
import { z } from 'zod';

/** 支付方式 */
type PaymentMethod = 'wechat' | 'alipay';

/** 创建订单 Schema */
const createOrderSchema = z.object({
  planId: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY', 'SINGLE_MONTHLY', 'SINGLE_QUARTERLY', 'SINGLE_YEARLY', 'CREDIT_10']),
  paymentMethod: z.enum(['wechat', 'alipay']).default('wechat'),
  isRenewal: z.boolean().default(false),
  // 多榨卡可一次购买多个（批量折扣）；会员套餐恒为 1
  quantity: z.number().int().min(1).max(CREDIT_PACK_MAX_QTY).default(1),
  // 单导师付费：绑定的分身 ID（下单单导师套餐时必填）
  mentorId: z.string().min(1).max(64).optional(),
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

    // 3. 识别商品：多榨卡 / 单导师订阅 / 全导师订阅
    const creditPack = getCreditPackById(planId);
    const subParsed = creditPack ? null : parseAnyPlanId(planId);
    const plan = subParsed?.scope === 'ALL' ? getPlanById(planId) : undefined;
    const singlePlan = subParsed?.scope === 'SINGLE' ? getSinglePlanById(planId) : undefined;

    // 数量只对多榨卡生效；会员套餐恒为 1，忽略客户端传值
    const quantity = creditPack ? parsed.data.quantity : 1;

    if (!creditPack && !subParsed) {
      return NextResponse.json(
        { error: '无效的商品' },
        { status: 400 }
      );
    }

    // 单导师订阅：必须携带有效分身 ID（B-1：未选导师不能下单）
    let singleMentor: ReturnType<typeof getMentorById> = undefined;
    if (subParsed?.scope === 'SINGLE') {
      singleMentor = parsed.data.mentorId
        ? getMentorById(parsed.data.mentorId)
        : undefined;
      if (!singleMentor || singleMentor.comingSoon) {
        return NextResponse.json(
          { error: '请先选中想要对话的导师，再来这里付费，谢谢你的支持。' },
          { status: 400 }
        );
      }
    }

    // 4. 会员订阅：校验互斥切换与升级/续费等级（多榨卡任何人可重复购买）
    let existingSub: Awaited<ReturnType<typeof prisma.subscription.findFirst>> = null;
    if (subParsed) {
      existingSub = await prisma.subscription.findFirst({
        where: {
          userId: session.user.id,
          status: 'ACTIVE',
          endDate: { gt: new Date() },
        },
      });

      if (existingSub) {
        // 当前卡剩余轮次（scope=SINGLE 只计绑定导师）；> 0 时触发互斥规则
        const remaining = await getSubscriptionRoundsRemaining({
          userId: session.user.id,
          plan: existingSub.plan,
          scope: existingSub.scope,
          mentorId: existingSub.mentorId,
          startDate: existingSub.startDate,
        });
        const hasRemaining = remaining > 0;

        const planRank: Record<string, number> = {
          MONTHLY: 1,
          QUARTERLY: 2,
          YEARLY: 3,
        };
        const currentRank = planRank[existingSub.plan] || 0;
        const newRank = planRank[subParsed.basePlan] || 0;
        const isSamePlanRenewal = existingSub.plan === subParsed.basePlan;

        // 升级/续费等级校验（同方案同卡专用）：低级或同级非续费一律拒绝
        const checkUpgradeRank = () => {
          if (newRank < currentRank || (newRank === currentRank && !isSamePlanRenewal)) {
            return NextResponse.json(
              { error: '你已有同级或更高级会员，无需重复订阅' },
              { status: 400 }
            );
          }
          // 年卡续费上限：来自年卡的剩余天数 > 1460 天（4 年）时不可再续
          if (isSamePlanRenewal && subParsed.basePlan === 'YEARLY') {
            const daysRemaining = Math.ceil(
              (existingSub!.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
            );
            if (daysRemaining > YEARLY_RENEWAL_CAP_DAYS) {
              return NextResponse.json(
                { error: '年卡剩余时长已超过 4 年，暂无法续费，待剩余天数回落至 1460 天内可再续' },
                { status: 400 }
              );
            }
          }
          return null;
        };

        if (subParsed.scope === 'SINGLE') {
          const isSameSingleCard =
            existingSub.scope === 'SINGLE' &&
            existingSub.mentorId === singleMentor!.id;
          if (isSameSingleCard) {
            // A-2/B-2：同一张单导师卡，走升级/续费累加
            const rejected = checkUpgradeRank();
            if (rejected) return rejected;
          } else if (hasRemaining) {
            // A-3/B-3 及跨导师选我：剩余轮次不为 0 一律须先用完
            return NextResponse.json(
              { error: `你目前还有 ${remaining} 对话轮次没用完，为保证你的权益，必须用完才能切换为单导师订阅，感谢你的支持。` },
              { status: 400 }
            );
          }
          // 剩余轮次为 0：视为新订阅，放行
        } else {
          // 全导师付费
          if (existingSub.scope === 'SINGLE') {
            // C-3：单导师卡有剩余轮次时须先用完
            if (hasRemaining) {
              return NextResponse.json(
                { error: `你目前还有 ${remaining} 对话轮次没用完，为保证你的权益，必须用完才能切换为全导师订阅，感谢你的支持。` },
                { status: 400 }
              );
            }
            // 剩余轮次为 0：视为新订阅，放行
          } else {
            // C-2：同为全导师卡，走升级/续费累加
            const rejected = checkUpgradeRank();
            if (rejected) return rejected;
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
    const subPriceFen = singlePlan ? singlePlan.priceFen : plan?.priceFen;
    const actualPriceFen = creditPack
      ? calcCreditPackPriceFen(creditPack, quantity)
      : subPriceFen!;
    const actualPrice = Number((actualPriceFen / 100).toFixed(2));
    const totalCredits = creditPack ? creditPack.credits * quantity : 0;
    const subPlanName = singlePlan
      ? `单导师·${singleMentor!.name} ${singlePlan.name}`
      : plan?.name;
    const productName = creditPack
      ? `多榨卡 ${totalCredits}轮次${quantity > 1 ? `（${quantity}包）` : ''}`
      : subPlanName!;
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
                planId: (singlePlan ?? plan)!.id,
                planName: subPlanName,
                ...(singlePlan && singleMentor
                  ? { mentorId: singleMentor.id, mentorName: singleMentor.name }
                  : {}),
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
