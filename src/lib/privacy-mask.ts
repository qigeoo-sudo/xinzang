/**
 * 展示层脱敏：手机号 199****9934；用户名隐藏中段（李*然 / A***n / 钓*）。
 * 按 Unicode 码位切分，避免代理对字符被截断。
 */

/** 手机号：保留前 3 后 4，中间固定 4 个 *（与隐藏位数无关）；非 11 位原样返回 */
export function maskPhone(input: string | null | undefined): string {
  if (!input) return '—';
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 11) return input;
  return `${digits.slice(0, 3)}****${digits.slice(7)}`;
}

/**
 * 用户名：
 * - 1 个字符：原样
 * - 2 个字符：只留头部，尾部全部隐藏（钓*）
 * - ≥3 字符：头 + 星 + 尾；含中文用单星（李*然），纯字母/其他用三星（A***n），星数与隐藏字符数无关
 */
export function maskName(input: string | null | undefined): string {
  if (!input) return '—';
  const chars = Array.from(input.trim());
  if (chars.length <= 1) return input;
  if (chars.length === 2) return `${chars[0]}*`;
  const head = chars[0];
  const tail = chars[chars.length - 1];
  const star = /[\u4e00-\u9fff]/.test(input) ? '*' : '***';
  return `${head}${star}${tail}`;
}
