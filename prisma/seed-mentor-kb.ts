/**
 * 导师知识卡统一 seed 脚本 — Lydia Chen
 *
 * 白名单数据源:
 *   - prisma/data/lydia_cards_v1.1.jsonl      第一轮 38 张
 *   - prisma/data/lydia_r2_cards_v0.4.jsonl   第二轮 27 张 approved
 *
 * 运行:
 *   npx tsx prisma/seed-mentor-kb.ts              # 正式导入
 *   npx tsx prisma/seed-mentor-kb.ts --dry-run    # 只解析校验，不写库
 *
 * 严格规则（违反即失败退出）:
 *   - 白名单外的文件不导入
 *   - 重复 cardId 立即失败
 *   - 未知 mentorId 立即失败（仅 mentor_lydia → lydia）
 *   - 无效 status / publicationScope / confidence 立即失败
 *   - source 无法解析为字符串数组立即失败
 *   - 第一轮 publication_scope 不直接写入，新卡默认为 internal_only
 *   - 第一轮 limits_and_exceptions 完整放入 exceptions，不自动拆分
 *
 * 特殊规则:
 *   - LYD-R1-023 → hold_for_round2 / internal_only（被 LYD-R2-017 取代）
 *   - LYD-R2-PENDING-004 → rejected / excluded（若存在）
 */
import { PrismaClient } from '../src/generated/prisma';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ===== 环境变量加载（tsx 不自动加载 .env） =====
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

// ===== 命令行参数 =====
const DRY_RUN = process.argv.includes('--dry-run');

// ===== 白名单配置 =====
const SOURCE_FILES = [
  {
    label: '第一轮',
    path: 'prisma/data/lydia_cards_v1.1.jsonl',
    sourceKey: 'snake_case',
    preserveStatus: true, // 第一轮：已审核状态不覆盖
    defaultVersion: 'v1.1',
  },
  {
    label: '第二轮',
    path: 'prisma/data/lydia_r2_cards_v0.4.jsonl',
    sourceKey: 'camelCase',
    preserveStatus: false, // 第二轮：全量 upsert
    defaultVersion: 'v0.4',
  },
];

// ===== 合法枚举值 =====
const VALID_STATUSES = new Set([
  'candidate',
  'draft',
  'hold_for_round2',
  'mentor_unconfirmed',
  'approved',
  'published',
  'rejected',
]);

const VALID_PUBLICATION_SCOPES = new Set([
  'internal_only',
  'excluded',
  'public_generalized',
  'public_exact',
]);

const VALID_CONFIDENCES = new Set(['high', 'medium', 'low']);

// mentor_id → 运行时规范 ID 的精确映射
const MENTOR_ID_MAP: Record<string, string> = {
  mentor_lydia: 'lydia',
};

// 第一轮已审核状态：导入时保留（不被源文件覆盖）
const PROTECTED_STATUSES = new Set([
  'approved',
  'published',
  'rejected',
  'hold_for_round2',
  'mentor_unconfirmed',
]);

// ===== 特殊规则 =====
interface SpecialRule {
  cardId: string;
  status: string;
  publicationScope: string;
  reason: string;
}

const SPECIAL_RULES: SpecialRule[] = [
  {
    cardId: 'LYD-R1-023',
    status: 'hold_for_round2',
    publicationScope: 'internal_only',
    reason: '旧薪酬强硬口径，已被 LYD-R2-017 取代',
  },
  {
    cardId: 'LYD-R2-PENDING-004',
    status: 'rejected',
    publicationScope: 'excluded',
    reason: '待确认卡已驳回，不进入检索',
  },
];

// ===== 类型定义 =====
interface RawCard {
  // 兼容两种命名
  card_id?: string;
  cardId?: string;
  mentor_id?: string;
  mentorId?: string;
  domain: string;
  title: string;
  core_view?: string;
  coreView?: string;
  reasoning?: string;
  applicable_when?: string;
  applicableTo?: string;
  limits_and_exceptions?: string;
  exceptions?: string;
  notApplicableTo?: string;
  prerequisites?: string;
  risks?: string;
  source?: unknown;
  confidence?: string;
  status?: string;
  effective_as_of?: string;
  validFrom?: string;
  publication_scope?: string;
  publicationScope?: string;
  reviewAfter?: string;
  version?: string;
}

interface NormalizedCard {
  cardId: string;
  mentorId: string;
  domain: string;
  title: string;
  coreView: string;
  reasoning: string | null;
  applicableTo: string | null;
  notApplicableTo: string | null;
  prerequisites: string | null;
  exceptions: string | null;
  risks: string | null;
  source: string | null; // JSON 字符串数组
  confidence: string;
  status: string;
  publicationScope: string;
  validFrom: string | null;
  reviewAfter: string | null;
  version: string;
}

// ===== 工具函数 =====

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function loadJsonl(filePath: string): RawCard[] {
  if (!existsSync(filePath)) {
    fail(`文件不存在: ${filePath}`);
  }
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as RawCard;
    } catch {
      fail(`JSON 解析失败: ${filePath} 第 ${i + 1} 行`);
    }
  });
}

function normalizeSource(source: unknown): string {
  // source 必须是字符串数组
  if (!Array.isArray(source)) {
    fail(`source 不是数组: ${JSON.stringify(source)}`);
  }
  for (const item of source) {
    if (typeof item !== 'string') {
      fail(`source 数组元素不是字符串: ${JSON.stringify(item)}`);
    }
  }
  return JSON.stringify(source);
}

function validateNormalized(card: NormalizedCard, sourceLabel: string) {
  if (!card.cardId) fail(`${sourceLabel}: cardId 为空`);
  if (!card.mentorId) fail(`${sourceLabel}: mentorId 为空`);
  if (card.mentorId !== 'lydia') {
    fail(`${sourceLabel}: 未知 mentorId "${card.mentorId}"（仅允许 lydia）`);
  }
  if (!VALID_STATUSES.has(card.status)) {
    fail(`${sourceLabel} ${card.cardId}: 无效 status "${card.status}"`);
  }
  if (!VALID_PUBLICATION_SCOPES.has(card.publicationScope)) {
    fail(`${sourceLabel} ${card.cardId}: 无效 publicationScope "${card.publicationScope}"`);
  }
  if (!VALID_CONFIDENCES.has(card.confidence)) {
    fail(`${sourceLabel} ${card.cardId}: 无效 confidence "${card.confidence}"`);
  }
  // 验证 source 可重新解析
  if (card.source !== null) {
    try {
      const parsed = JSON.parse(card.source);
      if (!Array.isArray(parsed)) throw new Error('not array');
    } catch {
      fail(`${sourceLabel} ${card.cardId}: source 无法解析为数组`);
    }
  }
}

function normalizeRound1(c: RawCard): NormalizedCard {
  const cardId = c.card_id;
  if (!cardId) fail('第一轮: card_id 为空');

  const mentorIdRaw = c.mentor_id ?? '';
  const mentorId = MENTOR_ID_MAP[mentorIdRaw];
  if (!mentorId) fail(`第一轮 ${cardId}: 未知 mentor_id "${mentorIdRaw}"`);

  // 第一轮 publication_scope 不直接写入
  // 新卡默认为 candidate / internal_only
  // （已存在的卡会由 preserveStatus 逻辑保护）
  const status = 'candidate';
  const publicationScope = 'internal_only';

  // source 是数组，需要 stringify
  const source = c.source !== undefined ? normalizeSource(c.source) : null;

  // limits_and_exceptions 完整放入 exceptions，不自动拆分
  return {
    cardId,
    mentorId,
    domain: c.domain,
    title: c.title,
    coreView: c.core_view ?? '',
    reasoning: c.reasoning ?? null,
    applicableTo: c.applicable_when ?? null,
    notApplicableTo: null,
    prerequisites: null,
    exceptions: c.limits_and_exceptions ?? null,
    risks: null,
    source,
    confidence: c.confidence ?? 'medium',
    status,
    publicationScope,
    validFrom: c.effective_as_of ?? null,
    reviewAfter: null,
    version: 'v1.1',
  };
}

function normalizeRound2(c: RawCard): NormalizedCard {
  const cardId = c.cardId;
  if (!cardId) fail('第二轮: cardId 为空');

  const mentorId = c.mentorId ?? '';
  if (mentorId !== 'lydia') {
    fail(`第二轮 ${cardId}: 未知 mentorId "${mentorId}"`);
  }

  // source 可能是字符串（已 stringify）或数组，统一先解析再序列化
  let source: string | null = null;
  if (c.source !== undefined && c.source !== null) {
    let sourceArr: string[];
    if (typeof c.source === 'string') {
      try {
        sourceArr = JSON.parse(c.source);
      } catch {
        fail(`第二轮 ${cardId}: source 字符串无法解析`);
      }
    } else if (Array.isArray(c.source)) {
      sourceArr = c.source;
    } else {
      fail(`第二轮 ${cardId}: source 类型无效`);
    }
    source = normalizeSource(sourceArr);
  }

  return {
    cardId,
    mentorId,
    domain: c.domain,
    title: c.title,
    coreView: c.coreView ?? '',
    reasoning: c.reasoning ?? null,
    applicableTo: c.applicableTo ?? null,
    notApplicableTo: c.notApplicableTo ?? null,
    prerequisites: c.prerequisites ?? null,
    exceptions: c.exceptions ?? null,
    risks: c.risks ?? null,
    source,
    confidence: c.confidence ?? 'medium',
    status: c.status ?? 'candidate',
    publicationScope: c.publicationScope ?? 'internal_only',
    validFrom: c.validFrom ?? null,
    reviewAfter: c.reviewAfter ?? null,
    version: c.version ?? 'v0.4',
  };
}

function checkNoDuplicates(cards: NormalizedCard[], label: string) {
  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.cardId)) {
      fail(`${label}: 重复 cardId "${c.cardId}"`);
    }
    seen.add(c.cardId);
  }
}

// ===== 主流程 =====

async function main() {
  console.log(`🚀 导师知识卡 seed ${DRY_RUN ? '（DRY-RUN 模式，不写库）' : ''}\n`);

  const prisma = new PrismaClient();

  // ---- 第 1 步：加载并规范化所有卡片 ----
  const allCards: NormalizedCard[] = [];
  const roundStats: { label: string; count: number }[] = [];

  for (const src of SOURCE_FILES) {
    const filePath = resolve(process.cwd(), src.path);
    const raw = loadJsonl(filePath);

    const normalized = raw.map((c) =>
      src.sourceKey === 'snake_case' ? normalizeRound1(c) : normalizeRound2(c),
    );

    // 校验
    checkNoDuplicates(normalized, src.label);
    for (const c of normalized) validateNormalized(c, src.label);

    console.log(`📥 ${src.label}: 读取 ${normalized.length} 张（${src.sourceKey} → 规范格式）`);
    roundStats.push({ label: src.label, count: normalized.length });
    allCards.push(...normalized);
  }

  // 跨轮查重
  const allIds = new Set(allCards.map((c) => c.cardId));
  if (allIds.size !== allCards.length) {
    fail('跨轮次存在重复 cardId');
  }
  console.log(`\n📊 合计: ${allCards.length} 张，${allIds.size} 个唯一 cardId`);

  // 检查第一轮 publication_scope 没有泄漏
  const r1Cards = allCards.filter((c) => c.cardId.startsWith('LYD-R1-'));
  const leaked = r1Cards.filter((c) => c.publicationScope === 'mentor_review_required');
  if (leaked.length > 0) {
    fail(`第一轮有 ${leaked.length} 张卡的 publicationScope 仍是 mentor_review_required`);
  }

  // 第二轮统计
  const r2Cards = allCards.filter((c) => c.cardId.startsWith('LYD-R2-'));
  const r2Approved = r2Cards.filter((c) => c.status === 'approved');
  const r2Gen = r2Approved.filter((c) => c.publicationScope === 'public_generalized').length;
  const r2Exact = r2Approved.filter((c) => c.publicationScope === 'public_exact').length;
  console.log(`   第二轮 approved: ${r2Approved.length} (generalized: ${r2Gen}, exact: ${r2Exact})`);

  if (DRY_RUN) {
    console.log('\n✅ DRY-RUN 校验通过，未写入数据库');
    await prisma.$disconnect();
    return;
  }

  // ---- 第 2 步：Upsert 到数据库 ----
  console.log('\n💾 写入数据库...');

  let totalCreated = 0;
  let totalUpdated = 0;

  for (const src of SOURCE_FILES) {
    const cards = allCards.filter((_, i) => {
      // 根据索引归属分配（先第一轮再第二轮）
      const r1Count = roundStats[0].count;
      if (src.label === '第一轮') return i < r1Count;
      return i >= r1Count;
    });

    let created = 0;
    let updated = 0;

    for (const c of cards) {
      const existing = await prisma.mentorKnowledgeCard.findUnique({
        where: { cardId: c.cardId },
        select: { id: true, status: true, publicationScope: true },
      });

      if (existing) {
        if (src.preserveStatus && PROTECTED_STATUSES.has(existing.status)) {
          // 保留状态，只更新内容
          const { status, publicationScope, ...contentFields } = c;
          await prisma.mentorKnowledgeCard.update({
            where: { id: existing.id },
            data: contentFields,
          });
        } else {
          await prisma.mentorKnowledgeCard.update({
            where: { id: existing.id },
            data: c,
          });
        }
        updated++;
      } else {
        await prisma.mentorKnowledgeCard.create({ data: c });
        created++;
      }
    }

    console.log(`  ${src.label}: 新建 ${created}，更新 ${updated}`);
    totalCreated += created;
    totalUpdated += updated;
  }

  // ---- 第 3 步：应用特殊规则 ----
  console.log('\n⚙️  应用特殊规则...');
  let rulesApplied = 0;
  for (const rule of SPECIAL_RULES) {
    const existing = await prisma.mentorKnowledgeCard.findUnique({
      where: { cardId: rule.cardId },
    });
    if (!existing) continue;

    const needsUpdate =
      existing.status !== rule.status || existing.publicationScope !== rule.publicationScope;

    if (needsUpdate) {
      await prisma.mentorKnowledgeCard.update({
        where: { cardId: rule.cardId },
        data: { status: rule.status, publicationScope: rule.publicationScope },
      });
      console.log(`  ✅ ${rule.cardId}: ${rule.reason}`);
      rulesApplied++;
    }
  }
  if (rulesApplied === 0) console.log('  （无需要调整的卡）');

  // ---- 第 4 步：后置校验 ----
  console.log('\n🔍 后置校验...');
  let checksPassed = 0;
  let checksFailed = 0;

  function check(label: string, passed: boolean, detail?: string) {
    if (passed) {
      console.log(`  ✅ ${label}`);
      checksPassed++;
    } else {
      console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
      checksFailed++;
    }
  }

  // 总数
  const total = await prisma.mentorKnowledgeCard.count({ where: { mentorId: 'lydia' } });
  check('总数 = 65', total === 65, `实际: ${total}`);

  // 状态分布
  const byStatus = await prisma.mentorKnowledgeCard.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: { mentorId: 'lydia' },
  });
  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));

  check(
    '第二轮 approved = 27',
    (statusMap['approved'] ?? 0) >= 27,
    `approved: ${statusMap['approved'] ?? 0}`,
  );

  // 第二轮精确统计（通过 cardId 前缀）
  const r2Count = await prisma.mentorKnowledgeCard.count({
    where: { mentorId: 'lydia', cardId: { startsWith: 'LYD-R2-' } },
  });
  check('第二轮卡数 = 27', r2Count === 27, `实际: ${r2Count}`);

  const r2ApprovedCount = await prisma.mentorKnowledgeCard.count({
    where: {
      mentorId: 'lydia',
      cardId: { startsWith: 'LYD-R2-' },
      status: 'approved',
    },
  });
  check('第二轮 approved = 27', r2ApprovedCount === 27, `实际: ${r2ApprovedCount}`);

  const r2GenCount = await prisma.mentorKnowledgeCard.count({
    where: {
      mentorId: 'lydia',
      cardId: { startsWith: 'LYD-R2-' },
      status: 'approved',
      publicationScope: 'public_generalized',
    },
  });
  const r2ExactCount = await prisma.mentorKnowledgeCard.count({
    where: {
      mentorId: 'lydia',
      cardId: { startsWith: 'LYD-R2-' },
      status: 'approved',
      publicationScope: 'public_exact',
    },
  });
  check(
    '第二轮 23 generalized + 4 exact',
    r2GenCount === 23 && r2ExactCount === 4,
    `generalized: ${r2GenCount}, exact: ${r2ExactCount}`,
  );

  // 无 mentor_review_required
  const mentorReviewCount = await prisma.mentorKnowledgeCard.count({
    where: { mentorId: 'lydia', publicationScope: 'mentor_review_required' },
  });
  check(
    '无 publicationScope=mentor_review_required',
    mentorReviewCount === 0,
    `实际: ${mentorReviewCount}`,
  );

  // LYD-R1-023 非公开
  const r1023 = await prisma.mentorKnowledgeCard.findUnique({
    where: { cardId: 'LYD-R1-023' },
    select: { status: true, publicationScope: true },
  });
  if (r1023) {
    const retrievable = r1023.status === 'approved' || r1023.status === 'published';
    const publicScope =
      r1023.publicationScope === 'public_generalized' ||
      r1023.publicationScope === 'public_exact';
    check('LYD-R1-023 不进入公开检索', !retrievable || !publicScope, `status: ${r1023.status}, scope: ${r1023.publicationScope}`);
  } else {
    check('LYD-R1-023 存在', false, '未找到');
  }

  // LYD-R2-017 是公开的（替代卡）
  const r2017 = await prisma.mentorKnowledgeCard.findUnique({
    where: { cardId: 'LYD-R2-017' },
    select: { status: true, publicationScope: true },
  });
  if (r2017) {
    check(
      'LYD-R2-017 是公开的（替代 LYD-R1-023）',
      r2017.status === 'approved' &&
        (r2017.publicationScope === 'public_generalized' ||
          r2017.publicationScope === 'public_exact'),
      `status: ${r2017.status}, scope: ${r2017.publicationScope}`,
    );
  } else {
    check('LYD-R2-017 存在', false, '未找到');
  }

  // source 全部可解析
  const allDbCards = await prisma.mentorKnowledgeCard.findMany({
    where: { mentorId: 'lydia' },
    select: { cardId: true, source: true },
  });
  let badSource = 0;
  for (const c of allDbCards) {
    if (c.source !== null) {
      try {
        const parsed = JSON.parse(c.source);
        if (!Array.isArray(parsed)) throw new Error('not array');
      } catch {
        badSource++;
        console.log(`     ⚠️  ${c.cardId}: source 无法解析`);
      }
    }
  }
  check('所有 source 可解析', badSource === 0, `异常: ${badSource}`);

  // 所有 mentorId = lydia
  const nonLydia = await prisma.mentorKnowledgeCard.count({
    where: { mentorId: { not: 'lydia' } },
  });
  check('所有 mentorId = lydia', nonLydia === 0, `非 lydia: ${nonLydia}`);

  // ---- 输出汇总 ----
  console.log(`\n📊 校验结果: ${checksPassed} 通过 / ${checksFailed} 失败`);

  console.log('\n📈 状态分布:');
  for (const s of byStatus.sort((a, b) => (a.status < b.status ? -1 : 1))) {
    console.log(`   ${s.status}: ${s._count._all}`);
  }

  const byScope = await prisma.mentorKnowledgeCard.groupBy({
    by: ['publicationScope'],
    _count: { _all: true },
    where: { mentorId: 'lydia' },
  });
  console.log('\n📈 公开范围分布:');
  for (const s of byScope.sort((a, b) => (a.publicationScope < b.publicationScope ? -1 : 1))) {
    console.log(`   ${s.publicationScope}: ${s._count._all}`);
  }

  await prisma.$disconnect();

  if (checksFailed > 0) {
    console.log('\n❌ 后置校验失败，请检查上面的错误项');
    process.exit(1);
  }

  console.log('\n✅ 知识卡导入完成，所有校验通过');
}

main().catch((e) => {
  console.error('❌ seed 失败:', e.message || e);
  process.exit(1);
});
