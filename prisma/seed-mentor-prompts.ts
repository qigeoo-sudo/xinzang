/**
 * 导师人格 Prompt 资产 seed —— 运行时资产入库入口（v1.2 资产出库配套），也供手工补灌。
 *
 * 用法：
 *   DATABASE_URL=<目标库> npx tsx prisma/seed-mentor-prompts.ts --file <bundle.json>
 *
 * bundle.json 结构（由本地治理文件生成）：
 *   { "globalPolicy": "<GLOBAL_MENTOR_SYSTEM_POLICY.md 原文>",
 *     "prompts": { "<mentorId>": "<prompts/<mentorId>_system_prompt.md 原文>" } }
 *
 * 行为：
 * - 按 key upsert（global_policy + 各导师 ID），任一行失败立即中止
 * - 不触碰其他表；DB 记录为运行时首选来源，文件仅作治理与回退
 */
import { PrismaClient } from '../src/generated/prisma';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// .env 加载（不覆盖已显式传入的环境变量，远程执行时 DATABASE_URL 优先）
for (const file of ['.env', '.env.local']) {
  const filePath = resolve(process.cwd(), file);
  if (!existsSync(filePath)) continue;
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function argValue(flag: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1 || !process.argv[i + 1]) fail(`缺少参数 ${flag} <值>`);
  return process.argv[i + 1];
}

const bundlePath = resolve(process.cwd(), argValue('--file'));
if (!existsSync(bundlePath)) fail(`bundle 不存在: ${bundlePath}`);

let bundle: { globalPolicy?: string; prompts?: Record<string, string> };
try {
  bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));
} catch (e) {
  fail(`bundle JSON 解析失败: ${(e as Error).message}`);
}

const entries: Array<{ key: string; content: string }> = [];
if (typeof bundle.globalPolicy === 'string' && bundle.globalPolicy.trim()) {
  entries.push({ key: 'global_policy', content: bundle.globalPolicy });
}
for (const [mentorId, content] of Object.entries(bundle.prompts ?? {})) {
  if (typeof content === 'string' && content.trim()) {
    entries.push({ key: mentorId, content });
  }
}
if (entries.length === 0) fail('bundle 内无有效资产（globalPolicy/prompts 均为空）');

const prisma = new PrismaClient();

async function main() {
  for (const { key, content } of entries) {
    const size = Buffer.byteLength(content, 'utf-8');
    await prisma.mentorPersonaPrompt.upsert({
      where: { key },
      create: { key, content },
      update: { content },
    });
    console.log(`✓ upsert ${key}（${(size / 1024).toFixed(1)} KB）`);
  }
  console.log(`完成：共 ${entries.length} 条 prompt 资产已入库`);
}

main()
  .catch((e) => {
    console.error('✗ seed 失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
