/**
 * 速率限制工具 — 修复安全审计 A01-1.1
 * 基于 IP 的内存速率限制 (适用于单实例部署)
 * 生产环境多实例部署建议改用 Redis
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// 定期清理过期条目 (每5分钟)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * 检查速率限制
 * @param identifier 标识符 (通常为 IP 或 userId)
 * @param limit 每时间窗口最大请求数
 * @param windowMs 时间窗口 (毫秒)
 * @returns { allowed: boolean; remaining: number; resetTime: number }
 */
export function rateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  // 首次请求或窗口已重置
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { allowed: true, remaining: limit - 1, resetTime: now + windowMs };
  }

  // 未超限
  if (entry.count < limit) {
    entry.count++;
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetTime: entry.resetTime,
    };
  }

  // 超过限制
  return { allowed: false, remaining: 0, resetTime: entry.resetTime };
}

/**
 * 从 Next.js Request 获取客户端 IP
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}
