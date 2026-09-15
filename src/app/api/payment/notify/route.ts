/**
 * 微信支付回调通知 API
 * POST /api/payment/notify — 微信支付回调
 *
 * 支付宝回调见 /api/payment/notify/alipay/route.ts（独立路由，避免 POST 方法冲突）
 *
 * 修复安全审计 A09-9.1: 回调必须验签
 * 修复安全审计: 回调必须校验金额一致性
 *
 * 回调流程:
 * 1. 验证签名 (防止伪造)
 * 2. 解密/解析回调数据
 * 3. 校验金额一致性
 * 4. 更新订单状态
 * 5. 创建订阅记录
 * 6. 更新用户会员状态
 * 7. 返回成功响应
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyNotifySignature,
  decryptNotifyResource,
  isMockMode,
} from '@/lib/wxpay';
import { fulfillPaidOrder, type FulfillResult } from '@/lib/payment-fulfillment';

// 支付成功后：金额一致性校验 + 统一履约（创建/接续订阅或加购轮次包）
async function handlePaymentSuccess(
  orderNo: string,
  transactionId: string,
  expectedAmountFen: number
): Promise<FulfillResult> {
  // 查找订单
  const order = await prisma.paymentOrder.findUnique({
    where: { orderNo },
  });

  if (!order) {
    console.error('Payment notify: order not found', orderNo);
    return { success: false, error: '订单不存在', status: 404 };
  }

  // 金额一致性校验 — 防止低金额回调获取高价值商品
  const orderAmountFen = Math.round(Number(order.amount) * 100);
  if (expectedAmountFen !== orderAmountFen) {
    console.error(`Payment notify: amount mismatch. Expected ${orderAmountFen} fen, got ${expectedAmountFen} fen`, { orderNo });
    return { success: false, error: '金额不一致', status: 400 };
  }

  return fulfillPaidOrder(orderNo, transactionId);
}

// ========== 微信支付回调 ==========
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const timestamp = request.headers.get('Wechatpay-Timestamp') || '';
    const nonce = request.headers.get('Wechatpay-Nonce') || '';
    const signature = request.headers.get('Wechatpay-Signature') || '';
    const serial = request.headers.get('Wechatpay-Serial') || '';

    // 1. 验证签名 — 安全审计 A09-9.1
    if (!isMockMode) {
      const isValid = verifyNotifySignature(
        timestamp,
        nonce,
        body,
        signature,
        serial
      );
      if (!isValid) {
        console.error('WxPay notify: invalid signature');
        return NextResponse.json(
          { code: 'FAIL', message: '签名验证失败' },
          { status: 401 }
        );
      }
    }

    // 2. 解析回调数据
    const notifyData = JSON.parse(body);
    const resource = notifyData.resource;

    if (!resource && !isMockMode) {
      return NextResponse.json(
        { code: 'FAIL', message: '无效的回调数据' },
        { status: 400 }
      );
    }

    // 3. 解密回调数据
    let outTradeNo: string;
    let transactionId: string;
    let amount: number;

    if (isMockMode) {
      // Mock 模式: 从 body 读取订单号和流水号，但金额必须从数据库订单读取
      outTradeNo = notifyData.outTradeNo || notifyData.out_trade_no;
      transactionId = notifyData.transactionId || notifyData.transaction_id || `mock_tx_${Date.now()}`;
      // 金额不从请求体读取，防止伪造
      const mockOrder = await prisma.paymentOrder.findUnique({ where: { orderNo: outTradeNo } });
      amount = mockOrder ? Math.round(Number(mockOrder.amount) * 100) : 0;
    } else {
      // 生产模式: 解密
      const decrypted = decryptNotifyResource(
        resource.ciphertext,
        resource.nonce,
        resource.associated_data
      );
      if (!decrypted) {
        return NextResponse.json(
          { code: 'FAIL', message: '解密失败' },
          { status: 400 }
        );
      }
      outTradeNo = decrypted.outTradeNo;
      transactionId = decrypted.transactionId;
      amount = decrypted.amount;
    }

    // 4. 处理支付成功（含金额校验）
    const result = await handlePaymentSuccess(outTradeNo, transactionId, amount);
    if (!result.success) {
      return NextResponse.json(
        { code: 'FAIL', message: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ code: 'SUCCESS', message: '成功' });
  } catch (error) {
    console.error('Payment notify error:', error);
    return NextResponse.json(
      { code: 'FAIL', message: '内部错误' },
      { status: 500 }
    );
  }
}
