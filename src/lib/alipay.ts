/**
 * 支付宝 WAP 支付工具库 — PRD 5.2 PWA 支付方案
 *
 * 实现支付宝手机网站支付 (alipay.trade.wap.pay) 流程:
 * 1. 统一下单 → 生成支付跳转链接
 * 2. 用户跳转支付宝完成支付
 * 3. 支付结果异步通知 (notify_url)
 * 4. 前端轮询订单状态
 *
 * 开发模式: 使用 mock 模式模拟支付流程
 * 生产模式: 调用支付宝开放平台 API
 *
 * 安全: API 密钥服务端管理，RSA2 签名验证
 */

import crypto from 'crypto';

// ========== 类型定义 ==========

export interface AlipayOrderParams {
  orderNo: string; // 业务订单号
  amount: number; // 金额 (分)
  description: string; // 商品描述
  clientIP: string; // 用户 IP
  userId: string; // 用户 ID
}

export interface AlipayOrderResult {
  success: boolean;
  payUrl?: string; // 支付宝跳转链接
  mock?: boolean; // 是否模拟模式
  error?: string;
}

export interface AlipayNotifyData {
  outTradeNo: string; // 业务订单号
  tradeNo: string; // 支付宝流水号
  tradeStatus: 'TRADE_FINISHED' | 'TRADE_SUCCESS' | 'WAIT_BUYER_PAY' | 'TRADE_CLOSED';
  totalAmount: string; // 支付金额 (元)
}

// ========== 配置 ==========

// Mock 模式必须显式开启，防止生产环境配置缺失时静默降级
const isAlipayMockMode = process.env.MOCK_PAYMENT_ENABLED === 'true';

const config = {
  appId: process.env.ALIPAY_APP_ID || '',
  // 应用私钥 (PKCS8 格式)
  privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
  // 支付宝公钥 (用于验签回调)
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
  // 网关地址 (沙箱/正式)
  gateway:
    process.env.ALIPAY_GATEWAY ||
    'https://openapi.alipay.com/gateway.do',
  notifyUrl:
    process.env.ALIPAY_NOTIFY_URL ||
    'https://your-domain.com/api/payment/notify/alipay',
  returnUrl:
    process.env.ALIPAY_RETURN_URL || 'https://your-domain.com/payment/return',
};

// ========== 工具函数 ==========

/**
 * 生成支付宝业务订单号: ALI_YYYYMMDD_随机8位
 * (与微信订单号前缀区分，便于排查)
 */
export function generateAlipayOrderNo(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = crypto.randomBytes(4).toString('hex');
  return `ALI_${dateStr}_${random}`;
}

/**
 * 支付宝 RSA2 (SHA256WithRSA) 签名生成
 *
 * 规则:
 * 1. 将所有请求参数 (除 sign/sign_type) 按字典序升序排列
 * 2. 拼接成 key=value&key=value 格式
 * 3. 使用应用私钥进行 RSA-SHA256 签名，输出 base64
 */
function generateSignature(params: Record<string, string>): string {
  if (!config.privateKey) return '';

  // 过滤空值与 sign 字段，按 key 字典序排序
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== '' && params[k] !== undefined)
    .sort();

  const message = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign(config.privateKey, 'base64');
}

/**
 * 将金额 (分) 转为支付宝要求的元 (字符串，保留两位小数)
 */
function fenToYuan(amountFen: number): string {
  return (amountFen / 100).toFixed(2);
}

// ========== 核心 API ==========

/**
 * 创建支付宝 WAP 支付订单
 *
 * 开发模式: 返回 mock 支付链接 (与微信 mock 一致，跳转 /payment/mock?orderNo=xxx)
 * 生产模式: 调用支付宝 alipay.trade.wap.pay 接口
 */
export async function createAlipayOrder(
  params: AlipayOrderParams
): Promise<AlipayOrderResult> {
  // Mock 模式 — 开发环境或未配置密钥
  if (isAlipayMockMode) {
    const mockPayUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/payment/mock?orderNo=${params.orderNo}&method=alipay&amount=${(params.amount / 100).toFixed(2)}`;
    return {
      success: true,
      payUrl: mockPayUrl,
      mock: true,
    };
  }

  // 生产模式 — 调用支付宝开放平台 alipay.trade.wap.pay
  try {
    const bizContent = JSON.stringify({
      out_trade_no: params.orderNo,
      total_amount: fenToYuan(params.amount),
      subject: params.description,
      product_code: 'QUICK_WAP_PAY', // 手机网站支付
      body: params.description,
      timeout_express: '30m', // 30 分钟超时
      // 扩展信息: 记录用户 ID 便于对账
      extend_params: {
        sys_service_provider_id: params.userId,
      },
    });

    const requestParams: Record<string, string> = {
      app_id: config.appId,
      method: 'alipay.trade.wap.pay',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: formatAlipayTimestamp(new Date()),
      version: '1.0',
      biz_content: bizContent,
      notify_url: config.notifyUrl,
      return_url: config.returnUrl,
    };

    // 生成签名
    const sign = generateSignature(requestParams);
    requestParams.sign = sign;

    // alipay.trade.wap.pay 通过 GET 方式返回支付跳转链接
    const queryString = Object.entries(requestParams)
      .map(
        ([k, v]) => `${k}=${encodeURIComponent(v)}`
      )
      .join('&');

    const payUrl = `${config.gateway}?${queryString}`;

    return {
      success: true,
      payUrl,
    };
  } catch (error) {
    console.error('Alipay order creation error:', error);
    return {
      success: false,
      error: '支付服务暂时不可用',
    };
  }
}

/**
 * 格式化支付宝时间戳: yyyy-MM-dd HH:mm:ss
 */
function formatAlipayTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// ========== 回调验签 ==========

/**
 * 验证支付宝异步通知签名 (生产环境)
 *
 * 安全: 回调必须验签，防止伪造支付结果
 *
 * @param notifyParams 支付宝异步通知的全部参数 (已解码)
 * @returns 验签是否通过
 */
export function verifyAlipayNotifySignature(
  notifyParams: Record<string, string>
): boolean {
  if (isAlipayMockMode) return true; // Mock 模式跳过验签

  if (!config.alipayPublicKey) return false;

  const sign = notifyParams.sign;
  const signType = notifyParams.sign_type;
  if (!sign) return false;

  // 按字典序排序，排除 sign / sign_type
  const sortedKeys = Object.keys(notifyParams)
    .filter(
      (k) => k !== 'sign' && k !== 'sign_type' && notifyParams[k] !== '' && notifyParams[k] !== undefined
    )
    .sort();

  const message = sortedKeys.map((k) => `${k}=${notifyParams[k]}`).join('&');

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    return verifier.verify(config.alipayPublicKey, sign, 'base64');
  } catch {
    return false;
  }
}

/**
 * 查询支付宝订单状态 (主动查单 alipay.trade.query)
 */
export async function queryAlipayOrder(orderNo: string): Promise<{
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  tradeNo?: string;
}> {
  if (isAlipayMockMode) {
    // Mock 模式: 从数据库查询状态
    return { status: 'PENDING' };
  }

  try {
    const bizContent = JSON.stringify({
      out_trade_no: orderNo,
    });

    const requestParams: Record<string, string> = {
      app_id: config.appId,
      method: 'alipay.trade.query',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: formatAlipayTimestamp(new Date()),
      version: '1.0',
      biz_content: bizContent,
    };

    const sign = generateSignature(requestParams);
    requestParams.sign = sign;

    const body = Object.entries(requestParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await fetch(config.gateway, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
    });

    const data = await response.json();
    const resp = data.alipay_trade_query_response;

    if (!resp) return { status: 'PENDING' };

    // 支付宝交易状态映射
    switch (resp.trade_status) {
      case 'TRADE_SUCCESS':
      case 'TRADE_FINISHED':
        return { status: 'PAID', tradeNo: resp.trade_no };
      case 'WAIT_BUYER_PAY':
        return { status: 'PENDING' };
      case 'TRADE_CLOSED':
        return { status: 'EXPIRED' };
      default:
        // ACQ.TRADE_NOT_EXIST 等错误归为失败
        if (resp.code && resp.code !== '10000') {
          return { status: 'FAILED' };
        }
        return { status: 'PENDING' };
    }
  } catch (error) {
    console.error('Query Alipay order error:', error);
    return { status: 'PENDING' };
  }
}

export { isAlipayMockMode };
