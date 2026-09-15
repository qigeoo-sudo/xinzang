/**
 * 支付宝异步通知回调
 * POST /api/payment/notify/alipay
 *
 * 支付宝异步通知只发 POST 请求，此路由独立处理，避免与微信回调
 * （/api/payment/notify 的 POST）冲突。
 *
 * 流程:
 * 1. 验证签名 (防伪造)
 * 2. 解析表单参数
 * 3. 校验金额一致性
 * 4. 委托 payment-fulfillment.ts 统一履约（幂等 + 并发保护）
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyAlipayNotifySignature, isAlipayMockMode } from '@/lib/alipay';
import { fulfillPaidOrder } from '@/lib/payment-fulfillment';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // 支付宝回调为表单格式
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = String(value);
    }

    // 1. 验签
    if (!isAlipayMockMode) {
      const isValid = verifyAlipayNotifySignature(params);
      if (!isValid) {
        console.error('Alipay notify: invalid signature');
        return new NextResponse('fail', { status: 401 });
      }
    }

    // 2. 解析回调数据
    const outTradeNo = params.out_trade_no;
    const tradeNo = params.trade_no;
    const tradeStatus = params.trade_status;
    const totalAmount = parseFloat(params.total_amount || '0');

    if (!outTradeNo || !tradeStatus) {
      return new NextResponse('fail', { status: 400 });
    }

    // 只处理支付成功状态
    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
      return new NextResponse('success');
    }

    // 3. 金额一致性校验 — 防止低金额回调获取高价值商品
    const order = await prisma.paymentOrder.findUnique({
      where: { orderNo: outTradeNo },
    });
    if (!order) {
      console.error('Alipay notify: order not found', outTradeNo);
      return new NextResponse('fail', { status: 404 });
    }
    const orderAmountFen = Math.round(Number(order.amount) * 100);
    const amountFen = Math.round(totalAmount * 100);
    if (amountFen !== orderAmountFen) {
      console.error(
        `Alipay notify: amount mismatch. Expected ${orderAmountFen} fen, got ${amountFen} fen`,
        { outTradeNo }
      );
      return new NextResponse('fail', { status: 400 });
    }

    // 4. 统一履约
    const result = await fulfillPaidOrder(outTradeNo, tradeNo);
    if (!result.success) {
      return new NextResponse('fail', { status: result.status });
    }

    return new NextResponse('success');
  } catch (error) {
    console.error('Alipay payment notify error:', error);
    return new NextResponse('fail', { status: 500 });
  }
}
