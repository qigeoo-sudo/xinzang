/**
 * 支付回调通知 API
 * POST /api/payment/notify        — 微信支付回调
 * POST /api/payment/notify/alipay — 支付宝回调
 *
 * 修复安全审计 A09-9.1: 回调必须验签
 * 修复安全审计: 回调必须校验金额一致性 + 支持支付宝回调
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
import {
  verifyAlipayNotifySignature,
  isAlipayMockMode,
} from '@/lib/alipay';

// 处理支付成功后的通用逻辑（更新订单 + 创建订阅 + 更新用户）
async function handlePaymentSuccess(
  orderNo: string,
  transactionId: string,
  expectedAmountFen: number
) {
  // 查找订单
  const order = await prisma.paymentOrder.findUnique({
    where: { orderNo },
  });

  if (!order) {
    console.error('Payment notify: order not found', orderNo);
    return { error: '订单不存在', status: 404 };
  }

  // 幂等检查 — 已支付的订单不重复处理
  if (order.status === 'PAID') {
    return { success: true, message: '成功（已处理）' };
  }

  // 金额一致性校验 — 防止低金额回调获取高价值订阅
  const orderAmountFen = Math.round(Number(order.amount) * 100);
  if (expectedAmountFen !== orderAmountFen) {
    console.error(`Payment notify: amount mismatch. Expected ${orderAmountFen} fen, got ${expectedAmountFen} fen`, { orderNo });
    return { error: '金额不一致', status: 400 };
  }

  // 解析订单元数据
  const metadata = order.metadata ? JSON.parse(order.metadata) : {};
  const planId = metadata.planId || 'MONTHLY';
  const durationDays = metadata.durationDays || 30;

  // 交互式事务: 先检查 PENDING 状态再创建订阅 — 防止并发重复处理
  try {
    await prisma.$transaction(async (tx) => {
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

      await tx.subscription.create({
        data: {
          userId: order.userId,
          plan: planId,
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
          paymentOrderId: order.id,
        },
      });

      await tx.user.update({
        where: { id: order.userId },
        data: { isPremium: true },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_PENDING') {
      console.error('Payment notify: order not in PENDING state', orderNo);
      return { error: '订单状态异常', status: 400 };
    }
    throw error;
  }

  console.log('Payment success:', orderNo, transactionId);
  return { success: true, message: '成功' };
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
      amount = mockOrder ? Math.round(mockOrder.amount * 100) : 0;
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
    if (result.error) {
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

// ========== 支付宝回调 ==========
export async function PUT(request: NextRequest) {
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

    // 3. 处理支付成功（含金额校验）
    // 支付宝金额为元（字符串），需转为分
    const amountFen = Math.round(totalAmount * 100);
    const result = await handlePaymentSuccess(outTradeNo, tradeNo, amountFen);
    if (result.error) {
      return new NextResponse('fail', { status: result.status });
    }

    return new NextResponse('success');
  } catch (error) {
    console.error('Alipay payment notify error:', error);
    return new NextResponse('fail', { status: 500 });
  }
}
