/**
 * 一次性脚本：bypass Next.js 鉴权，直接调 retryCommand 引擎函数重试 S15。
 * 用法：node scripts/retry-s15.mjs
 * 仅本地开发使用；不进生产。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(HERE, '..');

// 读 .env.local 设置 DATABASE_URL（prisma client 需要）
try {
  const envText = await readFile(path.join(repoRoot, '.env.local'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }
} catch (e) {
  console.error('读 .env.local 失败:', e.message);
  process.exit(1);
}

// 动态 import 引擎（tsx 运行时支持 @/ 别名映射，需 tsconfig）
const { retryCommand } = await import('../src/lib/content-ops/engine.ts');

// 查一个 admin 用户 id 作为 actor
const { prisma } = await import('../src/lib/prisma.ts');
const admin = await prisma.user.findFirst({
  where: { role: 'ADMIN_FULL' },
  select: { id: true, name: true, email: true },
});
if (!admin) {
  console.error('未找到 ADMIN_FULL 用户');
  process.exit(1);
}
console.log('使用 admin:', admin.name || admin.email);

const runId = 'cmuxfaf41008ulg26qzoo8q7v';
const stepCode = 'S15';

try {
  const result = await retryCommand(admin.id, runId, stepCode);
  console.log('retryCommand 结果:', JSON.stringify(result));
} catch (e) {
  console.error('retryCommand 失败:', e?.message || e);
  if (e?.status) console.error('HTTP status:', e.status);
  process.exit(1);
}

await prisma.$disconnect();
