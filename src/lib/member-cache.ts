/**
 * 会员状态短时缓存 — 减少聊天 API 数据库查询
 * 缓存 10 秒，平衡安全性和性能
 */
interface MemberStatus {
  isPremium: boolean;
  freeTrialUsed: number;
  fetchedAt: number;
}

const CACHE_TTL_MS = 10 * 1000;
const memberCache = new Map<string, MemberStatus>();

export function getCachedMemberStatus(userId: string): MemberStatus | null {
  const cached = memberCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    memberCache.delete(userId);
    return null;
  }
  return cached;
}

export function setCachedMemberStatus(
  userId: string,
  data: { isPremium: boolean; freeTrialUsed: number }
): void {
  memberCache.set(userId, { ...data, fetchedAt: Date.now() });
}

export function invalidateMemberCache(userId: string): void {
  memberCache.delete(userId);
}
