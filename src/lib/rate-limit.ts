/**
 * 速率限制工具 — 修复安全审计 A01-1.1
 * 基于 IP/用户标识的内存速率限制（Map 计数）
 *
 * 架构决策（2026-09 安全自检）：
 * - 当前生产为单容器 + SQLite 单文件库，不存在多实例，内存限流 100% 生效。
 * - 注意：限流只防「频率」（每分钟突发）；每日/周期对话轮次上限走数据库
 *   COUNT（见 chat/route.ts 配额检查），即使限流被绕过多刷请求，超额仍会被
 *   数据库计数拦截，不会多消耗 DeepSeek 额度。
 *
 * 迁移触发条件（必须先升级再扩容）：
 * - 迁移火山引擎 RDS MySQL 后若部署多个应用实例（或 K8s 水平扩容），
 *   每个进程各持一份 Map，限流会按实例数被稀释。
 * - 届时必须改为共享存储实现：@upstash/ratelimit（Redis）或数据库限流表，
 *   并移除本警告。
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// 生产环境提示：内存限流仅在单实例下有效（架构决策见文件头注释）
if (process.env.NODE_ENV === 'production') {
  console.warn('[RateLimit] 内存限流生效中（单实例约束）；扩容多实例前必须先迁移 Redis/DB 限流。');
}

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
 * 修复: X-Forwarded-For 信任问题 — 支持可信代理数量配置
 * 设置 TRUSTED_PROXY_COUNT 环境变量控制从 XFF 链中取倒数第 N 个 IP
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim());
    const trustedCount = parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10);
    // 从末尾取倒数第 trustedCount 个 IP（跳过可信代理层）
    const clientIP = ips[Math.max(0, ips.length - trustedCount)];
    if (clientIP) return clientIP;
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}
