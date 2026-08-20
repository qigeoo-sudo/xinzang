/**
 * 导师知识卡种子脚本 — Lydia Chen 第一轮候选知识卡
 *
 * 数据源: prisma/data/lydia_cards_v1.1.jsonl (38 张候选知识卡)
 * 运行: npx tsx prisma/seed-mentor-kb.ts
 *
 * 说明:
 * - 知识卡统一标记为 candidate，仅用于内部测试与评测。
 * - 导师审核通过后，再把 status 改为 approved/published。
 * - 审核稿、访谈工作底稿、评测题不进入本知识库（分别属于审核/溯源/测试材料）。
 */
import { PrismaClient } from '../src/generated/prisma';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// tsx 不自动加载 .env，手动加载以保证 DATABASE_URL 可用
for (const file of ['.env', '.env.local']) {
  const p = resolve(process.cwd(), file);
  let raw: string;
  try {
    raw = readFileSync(p, 'utf-8');
  } catch {
    continue;
  }
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
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const prisma = new PrismaClient();

interface CardJson {
  card_id: string;
  mentor_id: string;
  domain: string;
  title: string;
  core_view: string;
  reasoning?: string;
  applicable_when?: string;
  limits_and_exceptions?: string;
  source?: string[];
  confidence?: string;
  status?: string;
  effective_as_of?: string;
  publication_scope?: string;
}

// jsonl 中的 mentor_id 到 mentors.ts 中 id 的映射
const MENTOR_ID_MAP: Record<string, string> = {
  mentor_lydia: 'lydia',
};

function loadCards(): CardJson[] {
  const file = resolve(process.cwd(), 'prisma/data/lydia_cards_v1.1.jsonl');
  const raw = readFileSync(file, 'utf-8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as CardJson);
}

async function main() {
  const cards = loadCards();
  console.log(`读取到 ${cards.length} 张知识卡`);

  let created = 0;
  let updated = 0;

  for (const c of cards) {
    const mentorId = MENTOR_ID_MAP[c.mentor_id] ?? c.mentor_id;

    const data = {
      cardId: c.card_id,
      mentorId,
      domain: c.domain,
      title: c.title,
      coreView: c.core_view,
      reasoning: c.reasoning ?? null,
      applicableTo: c.applicable_when ?? null,
      exceptions: c.limits_and_exceptions ?? null,
      source: c.source ? JSON.stringify(c.source) : null,
      confidence: c.confidence ?? 'medium',
      status: c.status ?? 'candidate',
      publicationScope: 'internal_only', // candidate 卡：仅内部（导师审核通过后改为 public_exact/public_generalized）
      validFrom: c.effective_as_of ?? null,
      version: 'v1.1',
    };

    const existing = await prisma.mentorKnowledgeCard.findUnique({
      where: { cardId: c.card_id },
      select: { id: true },
    });

    if (existing) {
      await prisma.mentorKnowledgeCard.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await prisma.mentorKnowledgeCard.create({ data });
      created++;
    }
  }

  const byStatus = await prisma.mentorKnowledgeCard.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: { mentorId: 'lydia' },
  });

  console.log(`\n导入完成: 新建 ${created}，更新 ${updated}`);
  console.log('Lydia 知识卡状态分布:');
  for (const s of byStatus) {
    console.log(`  ${s.status}: ${s._count._all}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ 知识卡种子脚本失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
