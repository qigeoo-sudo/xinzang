/**
 * 统一知识卡 seed — knowledge-governance 规范 1.1 的唯一导入入口
 *
 * 数据源（Git 跟踪，生产构建容器内可读）：
 *   content/knowledge-governance/cards/<mentorId>_knowledge_cards.jsonl
 *
 * 运行：
 *   npx tsx prisma/seed-knowledge-cards.ts --dry-run   # 只校验不写库
 *   npx tsx prisma/seed-knowledge-cards.ts             # 校验 + 事务内幂等同步
 *
 * 行为：
 * - 全量结构/枚举/组合校验，任一非法立即失败，不写库
 * - cardId 全局唯一校验
 * - 六位导师数量必须与 CANONICAL_MENTORS 一致（33/62/48/64/67/65，共 339）
 * - 事务内按 cardId upsert；该导师不在规范集内的旧卡删除（孤儿清理）
 * - 不触碰其他导师和任何用户数据表
 */
import { PrismaClient } from '../src/generated/prisma';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CANONICAL_MENTORS,
  CANONICAL_TOTAL_CARDS,
  validateCanonicalCard,
  type CanonicalKnowledgeCard,
} from '../src/lib/kb-governance';

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

const DRY_RUN = process.argv.includes('--dry-run');
const CARDS_DIR = resolve(process.cwd(), 'content/knowledge-governance/cards');

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

interface LoadedMentor {
  mentorId: string;
  expected: number;
  cards: CanonicalKnowledgeCard[];
}

function loadAll(): LoadedMentor[] {
  const loaded: LoadedMentor[] = [];
  const globalCardIds = new Set<string>();

  for (const { mentorId, expectedCount } of CANONICAL_MENTORS) {
    const file = resolve(CARDS_DIR, `${mentorId}_knowledge_cards.jsonl`);
    if (!existsSync(file)) fail(`缺少规范文件: ${file}`);

    const lines = readFileSync(file, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length !== expectedCount) {
      fail(`${mentorId}: 期望 ${expectedCount} 张，文件实际 ${lines.length} 行`);
    }

    const cards: CanonicalKnowledgeCard[] = [];
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
      if (globalCardIds.has(card.cardId)) {
        fail(`cardId 全局重复: ${card.cardId}`);
      }
      globalCardIds.add(card.cardId);
      cards.push(card);
    });

    loaded.push({ mentorId, expected: expectedCount, cards });
  }

  const total = loaded.reduce((s, m) => s + m.cards.length, 0);
  if (total !== CANONICAL_TOTAL_CARDS) {
    fail(`总卡数 ${total} ≠ 规范要求 ${CANONICAL_TOTAL_CARDS}`);
  }
  return loaded;
}

async function main() {
  const mentors = loadAll();

  // 聚合断言：当前规范全部 external_approved；exact 仅 4 张且均属 lydia
  const all = mentors.flatMap((m) => m.cards);
  const nonApproved = all.filter((c) => c.knowledgeClass !== 'external_approved');
  if (nonApproved.length > 0) {
    fail(`存在 ${nonApproved.length} 张非 external_approved 卡，与当前规范快照不符`);
  }
  const exact = all.filter((c) => c.disclosureMode === 'exact');
  if (exact.length !== 4 || exact.some((c) => c.mentorId !== 'lydia')) {
    fail(
      `exact 卡应为 4 张且全部属于 lydia，实际 ${exact.length} 张: ${exact
        .map((c) => `${c.mentorId}/${c.cardId}`)
        .join(', ')}`,
    );
  }
  const withCaseText = all.filter((c) => typeof c.caseText === 'string' && c.caseText.length > 0);
  if (withCaseText.length !== 0) {
    fail(`当前规范案例卡应为 0，实际 ${withCaseText.length} 张 caseText 非空`);
  }

  console.log('校验通过：');
  for (const m of mentors) {
    console.log(`  ${m.mentorId.padEnd(9)} ${m.cards.length} 张`);
  }
  console.log(`  合计 ${all.length} 张，全部 external_approved；exact ${exact.length} 张（lydia）`);

  if (DRY_RUN) {
    console.log('\n--dry-run：未写库');
    return;
  }

  const prisma = new PrismaClient();

  for (const { mentorId, cards } of mentors) {
    const canonicalIds = new Set(cards.map((c) => c.cardId));

    await prisma.$transaction(async (tx) => {
      // 孤儿清理：该导师库中存在、但规范集已移除的旧卡（如被移出知识库的风格卡）
      const existing = await tx.mentorKnowledgeCard.findMany({
        where: { mentorId },
        select: { cardId: true },
      });
      const orphanIds = existing
        .map((c) => c.cardId)
        .filter((id) => !canonicalIds.has(id));
      if (orphanIds.length > 0) {
        await tx.mentorKnowledgeCard.deleteMany({
          where: { mentorId, cardId: { in: orphanIds } },
        });
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
        throw new Error(
          `${mentorId} 同步后数量 ${dbCount} ≠ 规范 ${cards.length}，事务回滚`,
        );
      }
    });

    console.log(`  ✓ ${mentorId}: 已同步 ${cards.length} 张`);
  }

  const totalDb = await prisma.mentorKnowledgeCard.count();
  console.log(`\n完成：库内知识卡总数 ${totalDb}（规范 ${CANONICAL_TOTAL_CARDS}）`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
