/**
 * 支付成功后的统一履约逻辑（微信/支付宝回调与 Mock 支付共用）
 *
 * 两种商品：
 * 1. SUBSCRIPTION 会员订阅 — 立即生效；已有有效订阅时，到期日按自然月对日接续
 *    （月卡 10/14 到期，当天升级季卡 → 到期日变为次年 1/14，权益立即升级）
 * 2. CREDIT_PACK 多榨卡 — 不建订阅、不改会员身份，仅增加导师分身轮次余额
 */
import { prisma } from '@/lib/prisma';
import { invalidateMemberCache } from '@/lib/member-cache';
import {
  getPlanById,
  getCreditPackById,
  PLAN_DURATION_MONTHS,
  addMonthsDate,
} from '@/lib/plans';

export type FulfillResult =
  | { success: true; message: string }
  | { success: false; error: string; status: number };

export async function fulfillPaidOrder(
  orderNo: string,
  transactionId: string
): Promise<FulfillResult> {
  const order = await prisma.paymentOrder.findUnique({ where: { orderNo } });

  if (!order) {
    console.error('Payment fulfill: order not found', orderNo);
    return { success: false, error: '订单不存在', status: 404 };
  }

  // 幂等：已支付订单不重复履约
  if (order.status === 'PAID') {
    return { success: true, message: '成功（已处理）' };
  }

  const metadata = order.metadata ? JSON.parse(order.metadata) : {};

  try {
    await prisma.$transaction(async (tx) => {
      // 仅 PENDING 订单可履约 — 防止并发重复处理
      const result = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          transactionId,
          paidAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new Error('ORDER_NOT_PENDING');
      }

      if (order.paymentType === 'CREDIT_PACK') {
        // 多榨卡：余额累加，永久有效
        const pack = getCreditPackById(metadata.planId);
        const credits = metadata.credits ?? pack?.credits ?? 0;
        if (!credits || credits <= 0) {
          throw new Error('INVALID_CREDIT_PACK');
        }

        await tx.user.update({
          where: { id: order.userId },
          data: { mentorCredits: { increment: credits } },
        });
        return;
      }

      // 会员订阅（默认分支，兼容历史订单）
      const plan = getPlanById(metadata.planId || 'MONTHLY');
      if (!plan) {
        throw new Error('INVALID_PLAN');
      }
      const months = PLAN_DURATION_MONTHS[plan.id] ?? 1;

      // 查当前有效订阅 — 有则在原到期日上接续，无则从现在起算
      const existingSub = await tx.subscription.findFirst({
        where: {
          userId: order.userId,
          status: 'ACTIVE',
          endDate: { gt: new Date() },
        },
        orderBy: { endDate: 'desc' },
      });

      if (existingSub) {
        // 立即升级：套餐当场切换，剩余时长按新套餐自然月数接续
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: {
            plan: plan.id,
            endDate: addMonthsDate(existingSub.endDate, months),
            paymentOrderId: order.id,
          },
        });
      } else {
        const now = new Date();
        await tx.subscription.create({
          data: {
            userId: order.userId,
            plan: plan.id,
            status: 'ACTIVE',
            startDate: now,
            endDate: addMonthsDate(now, months),
            paymentOrderId: order.id,
          },
        });
      }

      await tx.user.update({
        where: { id: order.userId },
        data: { isPremium: true },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_PENDING') {
      console.error('Payment fulfill: order not in PENDING state', orderNo);
      return { success: false, error: '订单状态异常', status: 400 };
    }
    throw error;
  }

  invalidateMemberCache(order.userId);
  console.log('Payment fulfilled:', orderNo, transactionId, order.paymentType);
  return { success: true, message: '成功' };
}
