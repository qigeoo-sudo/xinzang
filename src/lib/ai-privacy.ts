/**
 * AI API 隐私保护 — 发送给第三方 AI 前脱敏
 */

/**
 * 脱敏用户消息中的手机号和邮箱
 * 手机号: 13812345678 → 138****5678
 * 邮箱: user@example.com → us***@example.com
 */
export function redactPII(text: string): string {
  return text
    .replace(/1[3-9]\d{9}/g, (match) => match.slice(0, 3) + '****' + match.slice(-4))
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
      const atIndex = match.indexOf('@');
      const local = match.slice(0, atIndex);
      const domain = match.slice(atIndex);
      const maskedLocal = local.length > 2 ? local.slice(0, 2) + '***' : '***';
      return maskedLocal + domain;
    });
}

/**
 * AI 隐私声明 — 在注册页或隐私政策中展示
 */
export const AI_PRIVACY_NOTICE =
  '本平台的 AI 对话功能会将您的消息内容发送至第三方 AI 服务商（如 DeepSeek）进行处理。' +
  '请勿在对话中输入身份证号、银行卡号等敏感信息。平台已对消息中的手机号和邮箱进行脱敏处理。';
