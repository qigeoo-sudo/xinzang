/**
 * 微信支付 H5 工具库 — PRD 5.2 PWA 支付方案
 *
 * 实现微信支付 H5 支付流程:
 * 1. 统一下单 → 获取 prepay_id 和 H5 支付链接
 * 2. 用户跳转微信客户端完成支付
 * 3. 支付结果异步通知 (notify_url)
 * 4. 前端轮询订单状态
 *
 * 开发模式: 使用 mock 模式模拟支付流程
 * 生产模式: 调用微信支付 API v3
 *
 * 安全: 修复审计 A09-9.1 — API 密钥服务端管理，签名验证
 */

import crypto from 'crypto';

// ========== 类型定义 ==========

export interface WxPayOrderParams {
  orderNo: string; // 业务订单号
  amount: number; // 金额 (分)
  description: string; // 商品描述
  clientIP: string; // 用户 IP
  userId: string; // 用户 ID
}

export interface WxPayOrderResult {
  success: boolean;
  prepayId?: string;
  payUrl?: string; // H5 支付跳转链接
  mock?: boolean; // 是否模拟模式
  error?: string;
}

export interface WxPayNotifyData {
  orderId: string; // 微信支付订单号
  outTradeNo: string; // 业务订单号
  transactionId: string; // 微信支付流水号
  amount: number; // 支付金额 (分)
  status: 'SUCCESS' | 'FAIL';
}

// ========== 配置 ==========

// Mock 模式必须显式开启，防止生产环境配置缺失时静默降级
const isMockMode = process.env.MOCK_PAYMENT_ENABLED === 'true';

const config = {
  appId: process.env.WXPAY_APP_ID || '',
  mchId: process.env.WXPAY_MCH_ID || '',
  apiV3Key: process.env.WXPAY_API_V3_KEY || '',
  serialNo: process.env.WXPAY_SERIAL_NO || '',
  privateKey: process.env.WXPAY_PRIVATE_KEY || '',
  // 微信支付平台证书公钥（用于验证回调签名，非 API v3 密钥）
  platformCertPem: process.env.WXPAY_PLATFORM_CERT_PEM || '',
  notifyUrl:
    process.env.WXPAY_NOTIFY_URL ||
    'https://your-domain.com/api/payment/notify',
  h5NotifyUrl:
    process.env.WXPAY_H5_RETURN_URL || 'https://your-domain.com/payment/return',
};

// ========== 工具函数 ==========

/**
 * 生成业务订单号: ACC_YYYYMMDD_随机8位
 */
export function generateOrderNo(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = crypto.randomBytes(4).toString('hex');
  return `ACC_${dateStr}_${random}`;
}

/**
 * 微信支付 v3 签名生成
 */
function generateSignature(
  method: string,
  url: string,
  timestamp: string,
  nonceStr: string,
  body: string
): string {
  if (!config.privateKey) return '';

  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign(config.privateKey, 'base64');
}

/**
 * 生成 Authorization header
 */
function buildAuthHeader(method: string, url: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');

  const signature = generateSignature(
    method,
    url,
    timestamp,
    nonceStr,
    body
  );

  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.serialNo}"`;
}

// ========== 核心 API ==========

/**
 * 创建微信支付 H5 订单
 *
 * 开发模式: 返回 mock 支付链接
 * 生产模式: 调用微信支付 v3 API
 */
export async function createWxPayOrder(
  params: WxPayOrderParams
): Promise<WxPayOrderResult> {
  // Mock 模式 — 开发环境或未配置密钥
  if (isMockMode) {
    const mockPayUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/payment/mock?orderNo=${params.orderNo}&method=wechat&amount=${(params.amount / 100).toFixed(2)}`;
    return {
      success: true,
      prepayId: `mock_prepay_${Date.now()}`,
      payUrl: mockPayUrl,
      mock: true,
    };
  }

  // 生产模式 — 调用微信支付 v3 API
  try {
    const apiUrl = '/v3/pay/transactions/h5';
    const fullUrl = 'https://api.mch.weixin.qq.com' + apiUrl;

    const requestBody = JSON.stringify({
      appid: config.appId,
      mchid: config.mchId,
      description: params.description,
      out_trade_no: params.orderNo,
      time_expire: new Date(Date.now() + 30 * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, '+08:00'),
      notify_url: config.notifyUrl,
      amount: {
        total: params.amount,
        currency: 'CNY',
      },
      payer: {
        // H5 支付不需要 openid
      },
      scene_info: {
        payer_client_ip: params.clientIP,
        h5_info: {
          type: 'Wap',
        },
      },
    });

    const authHeader = buildAuthHeader('POST', apiUrl, requestBody);

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        Accept: 'application/json',
      },
      body: requestBody,
    });

    const data = await response.json();

    if (response.ok && data.h5_url) {
      return {
        success: true,
        prepayId: data.prepay_id,
        payUrl: data.h5_url,
      };
    }

    return {
      success: false,
      error: data.message || '微信支付下单失败',
    };
  } catch (error) {
    console.error('WxPay order creation error:', error);
    return {
      success: false,
      error: '支付服务暂时不可用',
    };
  }
}

/**
 * 验证微信支付回调签名 (生产环境)
 *
 * 安全: 修复审计 A09-9.1 — 回调必须验签
 * 修复: 使用 RSA-SHA256 + 微信支付平台公钥验签（非 HMAC + API v3 密钥）
 */
export function verifyNotifySignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  wechatpaySerial: string
): boolean {
  if (isMockMode) return true; // Mock 模式跳过验签

  // 生产环境: 必须配置微信支付平台证书公钥
  if (!config.platformCertPem) {
    console.error('WxPay: WXPAY_PLATFORM_CERT_PEM not configured, cannot verify callback signature');
    return false;
  }

  try {
    // 构造验签串: timestamp\nnonce\nbody\n
    const verifyMessage = `${timestamp}\n${nonce}\n${body}\n`;

    // 使用 RSA-SHA256 + 微信支付平台公钥验签
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(verifyMessage);

    // 支持 PEM 格式的平台证书公钥
    const publicKey = config.platformCertPem.includes('-----BEGIN')
      ? config.platformCertPem
      : `-----BEGIN CERTIFICATE-----\n${config.platformCertPem}\n-----END CERTIFICATE-----`;

    return verifier.verify(publicKey, signature, 'base64');
  } catch (error) {
    console.error('WxPay signature verification error:', error);
    return false;
  }
}

/**
 * 解密微信支付回调数据 (AES-256-GCM)
 */
export function decryptNotifyResource(
  ciphertext: string,
  nonce: string,
  associatedData: string
): WxPayNotifyData | null {
  if (isMockMode) return null;

  try {
    const key = Buffer.from(config.apiV3Key, 'utf-8');
    const ciphertextBuf = Buffer.from(ciphertext, 'base64');
    const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16);
    const encryptedData = ciphertextBuf.subarray(0, ciphertextBuf.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf-8'));
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associatedData, 'utf-8'));

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]).toString('utf-8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decrypt notify resource error:', error);
    return null;
  }
}

/**
 * 查询微信支付订单状态 (主动查单)
 */
export async function queryWxPayOrder(orderNo: string): Promise<{
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  transactionId?: string;
  amount?: number;
}> {
  if (isMockMode) {
    // Mock 模式: 从数据库查询状态
    return { status: 'PENDING' };
  }

  try {
    const apiUrl = `/v3/pay/transactions/out-trade-no/${orderNo}?mchid=${config.mchId}`;
    const fullUrl = 'https://api.mch.weixin.qq.com' + apiUrl;

    const authHeader = buildAuthHeader('GET', apiUrl, '');

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });

    const data = await response.json();

    if (data.trade_state === 'SUCCESS') {
      return {
        status: 'PAID',
        transactionId: data.transaction_id,
        amount: data.amount?.total,
      };
    } else if (data.trade_state === 'NOTPAY' || data.trade_state === 'USERPAYING') {
      return { status: 'PENDING' };
    } else if (data.trade_state === 'CLOSED' || data.trade_state === 'REVOKED') {
      return { status: 'EXPIRED' };
    } else {
      return { status: 'FAILED' };
    }
  } catch (error) {
    console.error('Query WxPay order error:', error);
    return { status: 'PENDING' };
  }
}

export { isMockMode };
