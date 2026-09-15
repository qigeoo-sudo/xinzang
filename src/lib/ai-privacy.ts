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
