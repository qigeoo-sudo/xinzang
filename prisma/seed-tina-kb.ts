/**
 * Tina Zhang 第一轮知识卡 seed。
 *
 * 运行：
 *   npx tsx prisma/seed-tina-kb.ts --dry-run
 *   npx tsx prisma/seed-tina-kb.ts
 *
 * 本文件只处理 mentorId=tina、cardId=TIN-R1-* 的 42 张内部候选卡。
 * 它不会删除或修改 Lydia、Winnie 或其他导师的知识卡，也不会把候选卡提升为公开状态。
 */
import { PrismaClient } from '../src/generated/prisma';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

for (const file of ['.env', '.env.local']) {
  const filePath = resolve(process.cwd(), file);
  if (!existsSync(filePath)) continue;
  const raw = readFileSync(filePath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
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

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE_FILE = resolve(
  process.cwd(),
  'prisma/data/tina_r1_cards_v0.1.jsonl',
);
const EXPECTED_COUNT = 42;
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const PROTECTED_STATUSES = new Set([
  'approved',
  'published',
  'rejected',
  'hold_for_round2',
  'mentor_unconfirmed',
]);

interface TinaCard {
  cardId: string;
  mentorId: string;
  domain: string;
  title: string;
  coreView: string;
  reasoning?: string | null;
  applicableTo?: string | null;
  notApplicableTo?: string | null;
  prerequisites?: string | null;
  exceptions?: string | null;
  risks?: string | null;
  source?: string | string[] | null;
  confidence: string;
  status: string;
  publicationScope: string;
  validFrom?: string | null;
  reviewAfter?: string | null;
  version: string;
}

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function normalizeSource(source: TinaCard['source']): string | null {
  if (source === undefined || source === null) return null;
  let parsed: unknown = source;
  if (typeof source === 'string') {
    try {
      parsed = JSON.parse(source);
    } catch {
      fail(`source 不是合法 JSON 数组：${source.slice(0, 80)}`);
    }
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    fail(`source 必须是字符串数组：${JSON.stringify(parsed)}`);
  }
  return JSON.stringify(parsed);
}

function loadCards(): TinaCard[] {
  if (!existsSync(SOURCE_FILE)) fail(`知识卡文件不存在：${SOURCE_FILE}`);
  const lines = readFileSync(SOURCE_FILE, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const cards = lines.map((line, index) => {
    try {
      return JSON.parse(line) as TinaCard;
    } catch {
      fail(`第 ${index + 1} 行 JSON 解析失败`);
    }
  });

  if (cards.length !== EXPECTED_COUNT) {
    fail(`知识卡数量应为 ${EXPECTED_COUNT}，实际为 ${cards.length}`);
  }

  const ids = new Set<string>();
  for (const card of cards) {
    if (!card.cardId.startsWith('TIN-R1-')) fail(`非法 cardId：${card.cardId}`);
    if (ids.has(card.cardId)) fail(`重复 cardId：${card.cardId}`);
    ids.add(card.cardId);
    if (card.mentorId !== 'tina') fail(`${card.cardId} mentorId 必须为 tina`);
    if (!card.domain || !card.title || !card.coreView) {
      fail(`${card.cardId} 缺少 domain/title/coreView`);
    }
    if (!VALID_CONFIDENCE.has(card.confidence)) {
      fail(`${card.cardId} confidence 无效：${card.confidence}`);
    }
    if (card.status !== 'approved') {
      fail(`${card.cardId} 源文件必须保持 status=approved`);
    }
    if (card.publicationScope !== 'public_generalized') {
      fail(`${card.cardId} 源文件必须保持 publicationScope=public_generalized`);
    }
    normalizeSource(card.source);
  }

  return cards;
}

async function main() {
  const cards = loadCards();
  console.log(`📥 Tina 第一轮：${cards.length} 张知识卡`);
  console.log('✅ 源状态：approved / public_generalized（已审核通过）');

  if (DRY_RUN) {
    console.log('✅ DRY-RUN 通过，未连接或写入数据库');
    return;
  }

  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;
  let preserved = 0;

  try {
    for (const card of cards) {
      const data = {
        ...card,
        source: normalizeSource(card.source),
      };
      const existing = await prisma.mentorKnowledgeCard.findUnique({
        where: { cardId: card.cardId },
        select: { id: true, mentorId: true, status: true, publicationScope: true },
      });

      if (!existing) {
        await prisma.mentorKnowledgeCard.create({ data });
        created++;
        continue;
      }

      if (existing.mentorId !== 'tina') {
        fail(`${card.cardId} 已被其他导师占用：${existing.mentorId}`);
      }

      if (PROTECTED_STATUSES.has(existing.status)) {
        const { status, publicationScope, ...content } = data;
        await prisma.mentorKnowledgeCard.update({
          where: { id: existing.id },
          data: content,
        });
        preserved++;
      } else {
        await prisma.mentorKnowledgeCard.update({
          where: { id: existing.id },
          data,
        });
      }
      updated++;
    }

    const total = await prisma.mentorKnowledgeCard.count({
      where: { mentorId: 'tina', cardId: { startsWith: 'TIN-R1-' } },
    });
    const wrongMentor = await prisma.mentorKnowledgeCard.count({
      where: { cardId: { startsWith: 'TIN-R1-' }, mentorId: { not: 'tina' } },
    });
    const sourceApproved = await prisma.mentorKnowledgeCard.count({
      where: {
        mentorId: 'tina',
        cardId: { startsWith: 'TIN-R1-' },
        status: 'approved',
        publicationScope: 'public_generalized',
      },
    });

    if (total !== EXPECTED_COUNT) fail(`数据库中 TIN-R1 卡数应为 42，实际为 ${total}`);
    if (wrongMentor !== 0) fail(`发现 ${wrongMentor} 张 TIN-R1 卡归属错误`);

    console.log(`✅ 导入完成：新建 ${created}，更新 ${updated}，保留审核状态 ${preserved}`);
    console.log(`✅ TIN-R1 总数 ${total}，其中 approved/public_generalized ${sourceApproved}`);
    console.log('ℹ️  正常用户聊天可检索 approved/public_generalized 卡。');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Tina 知识卡导入失败：', error);
  process.exit(1);
});
