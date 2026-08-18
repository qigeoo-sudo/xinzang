/**
 * 测试账号标识
 *
 * [2026-08-17] 自动恢复已禁用：为 ChatGPT 内测保留测试账号状态，
 * 取消原「5分钟后自动恢复初始状态」逻辑。
 *
 * 原逻辑：测试账号被修改后（如免费→会员、月度→年度），
 * 5分钟后自动恢复初始状态，方便不同人体验。
 */

// 测试账号标识符（phone 或 email）
const TEST_IDENTIFIERS = new Set([
  '13821668570', // 手机(免费)
  't@t.com',     // 邮箱(免费)
  '13821668571', // 手机(会员)
]);

/**
 * 判断用户是否为测试账号
 */
export function isTestAccount(identifier: string): boolean {
  return TEST_IDENTIFIERS.has(identifier);
}

/**
 * 已禁用：不做任何重置，保持测试账号状态稳定。
 * 保留函数签名以兼容现有调用点（auth.ts / chat/route.ts）。
 */
export async function resetTestAccountsIfNeeded(userId?: string) {
  return;
}
