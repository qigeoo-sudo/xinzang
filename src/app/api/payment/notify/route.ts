/**
 * 微信支付回调通知 API
 * POST /api/payment/notify
 *
 * 微信支付服务器在用户支付成功后异步调用此接口
 * 修复安全审计 A09-9.1: 回调必须验签
 *
 * 回调流程:
 * 1. 验证签名 (防止伪造)
 * 2. 解密回调数据 (AES-256-GCM)
 * 3. 更新订单状态
 * 4. 创建订阅记录
 * 5. 更新用户会员状态
 * 6. 返回成功响应
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyNotifySignature,
  decryptNotifyResource,
  isMockMode,
} from '@/lib/wxpay';

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

    if (!resource) {
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
      // Mock 模式: 直接从 body 读取
      outTradeNo = notifyData.outTradeNo || notifyData.out_trade_no;
      transactionId = notifyData.transactionId || notifyData.transaction_id || `mock_tx_${Date.now()}`;
      amount = notifyData.amount || 0;
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

    // 4. 查找订单
    const order = await prisma.paymentOrder.findUnique({
      where: { orderNo: outTradeNo },
    });

    if (!order) {
      console.error('WxPay notify: order not found', outTradeNo);
      return NextResponse.json(
        { code: 'FAIL', message: '订单不存在' },
        { status: 404 }
      );
    }

    // 5. 幂等检查 — 已支付的订单不重复处理
    if (order.status === 'PAID') {
      return NextResponse.json({ code: 'SUCCESS', message: '成功' });
    }

    // 6. 解析订单元数据
    const metadata = order.metadata ? JSON.parse(order.metadata) : {};
    const planId = metadata.planId || 'MONTHLY';
    const durationDays = metadata.durationDays || 30;

    // 7. 事务处理: 更新订单 + 创建订阅 + 更新用户
    await prisma.$transaction([
      prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          transactionId,
          paidAt: new Date(),
        },
      }),
      prisma.subscription.create({
        data: {
          userId: order.userId,
          plan: planId,
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
          paymentOrderId: order.id,
        },
      }),
      prisma.user.update({
        where: { id: order.userId },
        data: { isPremium: true },
      }),
    ]);

    console.log('Payment success:', outTradeNo, transactionId);

    // 8. 返回成功响应
    return NextResponse.json({ code: 'SUCCESS', message: '成功' });
  } catch (error) {
    console.error('Payment notify error:', error);
    return NextResponse.json(
      { code: 'FAIL', message: '内部错误' },
      { status: 500 }
    );
  }
}
