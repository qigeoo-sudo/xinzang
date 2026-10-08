/**
 * 单导师知识卡 seed —— S21 activate_pilot 段远程灌卡入口，也供手工补灌。
 *
 * 用法：
 *   DATABASE_URL=<目标库> npx tsx prisma/seed-mentor-cards.ts --file <cards.jsonl> --mentor <mentorId>
 *
 * 行为：
 * - 逐行 validateCanonicalCard 校验（schema 1.1、mentorId 归属、cardId 唯一），任一非法立即失败不写库
 * - 事务内按 cardId upsert；该 mentorId 下不在文件内的旧卡删除（孤儿清理）
 * - 不触碰其他导师和任何用户数据表
 */
import { PrismaClient } from '../src/generated/prisma';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  validateCanonicalCard,
  type CanonicalKnowledgeCard,
} from '../src/lib/kb-governance';

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

const mentorId = argValue('--mentor');
const fileArg = argValue('--file');
const cardsPath = resolve(process.cwd(), fileArg);
if (!existsSync(cardsPath)) fail(`卡文件不存在: ${cardsPath}`);

const lines = readFileSync(cardsPath, 'utf-8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const cards: CanonicalKnowledgeCard[] = [];
const ids = new Set<string>();
lines.forEach((line, idx) => {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (e) {
    fail(`${mentorId} 第 ${idx + 1} 行 JSON 解析失败: ${(e as Error).message}`);
  }
  const err = validateCanonicalCard(raw, mentorId);
  if (err) fail(`${mentorId} 第 ${idx + 1} 行校验失败: ${err}`);
  const card = raw as CanonicalKnowledgeCard;
  if (ids.has(card.cardId)) fail(`cardId 重复: ${card.cardId}`);
  ids.add(card.cardId);
  cards.push(card);
});

console.log(`校验通过：${mentorId} 共 ${cards.length} 张`);

const prisma = new PrismaClient();

async function main() {
await prisma.$transaction(async (tx) => {
  const existing = await tx.mentorKnowledgeCard.findMany({
    where: { mentorId },
    select: { cardId: true },
  });
  const orphanIds = existing
    .map((c) => c.cardId)
    .filter((id) => !ids.has(id));
  if (orphanIds.length > 0) {
    await tx.mentorKnowledgeCard.deleteMany({
      where: { mentorId, cardId: { in: orphanIds } },
    });
    console.log(`  孤儿清理：${orphanIds.length} 张`);
  }

  for (const c of cards) {
    const data = {
      schemaVersion: c.schemaVersion,
      mentorId: c.mentorId,
      domain: c.domain,
      title: c.title,
      caseText: c.caseText,
      coreView: c.coreView,
      reasoning: c.reasoning,
      applicableTo: c.applicableTo,
      notApplicableTo: c.notApplicableTo,
      prerequisites: c.prerequisites,
      exceptions: c.exceptions,
      risks: c.risks,
      source: JSON.stringify(c.source),
      confidence: c.confidence,
      knowledgeClass: c.knowledgeClass,
      disclosureMode: c.disclosureMode,
      validFrom: c.validFrom,
      reviewAfter: c.reviewAfter,
      version: c.version,
    };
    await tx.mentorKnowledgeCard.upsert({
      where: { cardId: c.cardId },
      create: { cardId: c.cardId, ...data },
      update: data,
    });
  }

  const dbCount = await tx.mentorKnowledgeCard.count({ where: { mentorId } });
  if (dbCount !== cards.length) {
    throw new Error(`${mentorId} 同步后数量 ${dbCount} ≠ 规范 ${cards.length}，事务回滚`);
  }
});

const total = await prisma.mentorKnowledgeCard.count();
console.log(`完成：${mentorId} ${cards.length} 张已同步；库内知识卡总数 ${total}`);
await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
