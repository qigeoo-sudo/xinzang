/**
 * 密码哈希工具 — 修复安全审计 A02-2.2
 * 使用 bcrypt 进行密码哈希和验证
 * 盐值轮数: 12 (兼顾安全性和性能)
 */
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * 对密码进行 bcrypt 哈希
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * 验证密码是否匹配哈希
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * 密码强度校验
 * 规则: 任意8位字母或数字
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  message?: string;
} {
  if (password.length < 8) {
    return { valid: false, message: '密码至少需要8位字符' };
  }
  if (!/^[a-zA-Z0-9]+$/.test(password)) {
    return { valid: false, message: '密码只能包含字母或数字' };
  }
  return { valid: true };
}
