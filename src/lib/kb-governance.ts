/**
 * 知识卡四分类治理 — 唯一事实来源
 *
 * 规范依据：content/knowledge-governance 下的
 * knowledge_card.schema.json 与 TRAE_CODE_REVISION_HANDOFF_2026-09-15.md
 *
 * 本文件零 @/ 别名、零 Prisma 依赖，供应用代码与 tsx 脚本共同使用。
 */

export const KNOWLEDGE_CLASSES = [
  'internal_pending',
  'internal_approved',
  'external_pending',
  'external_approved',
] as const;
export type KnowledgeClass = (typeof KNOWLEDGE_CLASSES)[number];

export const DISCLOSURE_MODES = ['none', 'generalized', 'exact'] as const;
export type DisclosureMode = (typeof DISCLOSURE_MODES)[number];

const INTERNAL_CLASSES: ReadonlySet<KnowledgeClass> = new Set([
  'internal_pending',
  'internal_approved',
]);
const EXTERNAL_CLASSES: ReadonlySet<KnowledgeClass> = new Set([
  'external_pending',
  'external_approved',
]);

export function isKnowledgeClass(v: unknown): v is KnowledgeClass {
  return typeof v === 'string' && (KNOWLEDGE_CLASSES as readonly string[]).includes(v);
}

export function isDisclosureMode(v: unknown): v is DisclosureMode {
  return typeof v === 'string' && (DISCLOSURE_MODES as readonly string[]).includes(v);
}

/** 内部类必须 disclosureMode=none；外部类只能 generalized/exact */
export function isClassDisclosureComboValid(
  cls: KnowledgeClass,
  mode: DisclosureMode,
): boolean {
  if (INTERNAL_CLASSES.has(cls)) return mode === 'none';
  if (EXTERNAL_CLASSES.has(cls)) return mode === 'generalized' || mode === 'exact';
  return false;
}

/**
 * 普通生产检索唯一允许的知识分类。
 * 过滤必须发生在 SQL where 层，不能检索后再靠 prompt 要求模型忽略。
 */
export const PRODUCTION_RETRIEVABLE_CLASSES: KnowledgeClass[] = ['external_approved'];

/**
 * 内测环境（MENTOR_INTERNAL_TEST=true）额外放行 external_pending。
 * internal_* 在任何环境都不进用户检索，开关无法放开。
 */
export function getRetrievableClasses(opts?: {
  internalTestEnabled?: boolean;
}): KnowledgeClass[] {
  const enabled =
    opts?.internalTestEnabled ?? process.env.MENTOR_INTERNAL_TEST === 'true';
  return enabled
    ? ['external_approved', 'external_pending']
    : ['external_approved'];
}

/** 六位规范导师与当前知识卡数量（与 manifest.json 一致） */
export const CANONICAL_MENTORS: ReadonlyArray<{
  mentorId: string;
  expectedCount: number;
}> = [
  { mentorId: 'freya', expectedCount: 54 },
  { mentorId: 'lydia', expectedCount: 63 },
  { mentorId: 'phyllis', expectedCount: 48 },
  { mentorId: 'tina', expectedCount: 64 },
  { mentorId: 'winnie', expectedCount: 67 },
  { mentorId: 'ying', expectedCount: 65 },
];

export const CANONICAL_MENTOR_IDS = CANONICAL_MENTORS.map((m) => m.mentorId);
export const CANONICAL_TOTAL_CARDS = CANONICAL_MENTORS.reduce(
  (sum, m) => sum + m.expectedCount,
  0,
);

/** 规范 jsonl 中的卡片结构（schemaVersion 1.1） */
export interface CanonicalKnowledgeCard {
  schemaVersion: string;
  cardId: string;
  mentorId: string;
  domain: string;
  title: string;
  caseText: string | null;
  coreView: string;
  reasoning: string | null;
  applicableTo: string | null;
  notApplicableTo: string | null;
  prerequisites: string | null;
  exceptions: string | null;
  risks: string | null;
  source: string[];
  confidence: string;
  knowledgeClass: KnowledgeClass;
  disclosureMode: DisclosureMode;
  validFrom: string | null;
  reviewAfter: string | null;
  version: string | null;
}

const REQUIRED_STRING_FIELDS = [
  'schemaVersion',
  'cardId',
  'mentorId',
  'domain',
  'title',
  'coreView',
  'confidence',
] as const;

/**
 * 校验一张规范卡；不合法时返回中文错误信息，合法返回 null。
 * 对应 handoff 14.1：未知枚举、缺必填、组合非法必须导入失败。
 */
export function validateCanonicalCard(
  raw: unknown,
  expectedMentorId: string,
): string | null {
  if (typeof raw !== 'object' || raw === null) return '不是 JSON 对象';
  const c = raw as Record<string, unknown>;

  for (const f of REQUIRED_STRING_FIELDS) {
    if (typeof c[f] !== 'string' || !(c[f] as string).length) {
      return `字段 ${f} 缺失或不是非空字符串`;
    }
  }
  if (c.schemaVersion !== '1.1') return `schemaVersion 必须为 1.1，实际 ${c.schemaVersion}`;
  if (c.mentorId !== expectedMentorId) {
    return `mentorId=${c.mentorId} 与文件归属导师 ${expectedMentorId} 不一致`;
  }
  if (!['low', 'medium', 'high'].includes(c.confidence as string)) {
    return `confidence 非法: ${c.confidence}`;
  }
  if (!Array.isArray(c.source) || c.source.length === 0) {
    return 'source 必须是非空数组';
  }
  if (!c.source.every((s) => typeof s === 'string' && s.length > 0)) {
    return 'source 数组元素必须是非空字符串';
  }
  if (!isKnowledgeClass(c.knowledgeClass)) {
    return `knowledgeClass 非法: ${String(c.knowledgeClass)}`;
  }
  if (!isDisclosureMode(c.disclosureMode)) {
    return `disclosureMode 非法: ${String(c.disclosureMode)}`;
  }
  if (!isClassDisclosureComboValid(c.knowledgeClass, c.disclosureMode)) {
    return `非法组合: ${c.knowledgeClass} 不能搭配 ${c.disclosureMode}`;
  }
  // 可空字段：允许 null 或字符串
  for (const f of [
    'caseText',
    'reasoning',
    'applicableTo',
    'notApplicableTo',
    'prerequisites',
    'exceptions',
    'risks',
    'validFrom',
    'reviewAfter',
    'version',
  ] as const) {
    const v = c[f];
    if (v !== null && typeof v !== 'string') {
      return `字段 ${f} 必须是字符串或 null`;
    }
  }
  // 案例卡：caseText 非空时 reasoning 必须非空
  if (typeof c.caseText === 'string' && c.caseText.length > 0) {
    if (typeof c.reasoning !== 'string' || c.reasoning.length === 0) {
      return '案例卡（caseText 非空）必须提供非空 reasoning（导师评点）';
    }
  }
  return null;
}
