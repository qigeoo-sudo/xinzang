/**
 * 导师知识库检索 + System Prompt 组装（knowledge-governance 1.1 版）
 *
 * 四层架构（handoff §4）：
 * 1. 全体导师共同 System Policy（content/.../GLOBAL_MENTOR_SYSTEM_POLICY.md）
 * 2. 平台运行规则（prompts.ts，路由/证据门禁等代码侧规则）
 * 3. 单导师人格 Prompt（content/.../prompts/<mentorId>_system_prompt.md）
 * 4. 经权限与披露过滤的知识 + 会话编排（ORCHESTRATOR_TEMPLATE）
 *
 * 权限矩阵（过滤发生在 SQL where，先于检索/排序）：
 * - 普通生产：只检索 knowledgeClass=external_approved
 * - MENTOR_INTERNAL_TEST=true（仅 staging/内测）：额外放行 external_pending
 * - internal_pending / internal_approved 在任何环境都不进入用户检索
 */
import { prisma } from './prisma';
import type { Mentor } from './mentors';
import {
  KnowledgeCardLike,
  tokenizeQuery,
  scoreCard,
  formatKnowledgeCards,
} from './kb-scoring';
import {
  assembleSystemPrompt,
  PLACEHOLDER_NONE,
} from './prompts';
import { getGlobalSystemPolicy, getMentorPersonaPrompt } from './mentor-content';
import { getRetrievableClasses } from './kb-governance';

/** 聊天上下文（由 route 注入，用于总调度变量） */
export interface MentorChatContext {
  userProfileConfirmed: string;
  assessmentContext?: string;
  conversationSummary?: string;
  currentTime: string;
  domainRoute?: string;
  evidencePolicy?: string;
  allowedScope?: string;
}

/** validFrom 未到生效时间的卡不参与检索 */
function isEffective(card: { validFrom?: string | null }): boolean {
  if (card.validFrom) {
    const ts = new Date(card.validFrom).getTime();
    if (Number.isFinite(ts) && ts > Date.now()) return false;
  }
  return true;
}

/**
 * 关键词检索数据库知识卡，按分数降序取 Top N。
 * 权限过滤在 SQL 层完成，不把无权卡读进内存。
 */
export async function searchKnowledgeCards(
  mentorId: string,
  query: string,
  topN: number = 4,
): Promise<KnowledgeCardLike[]> {
  // Prisma 以 String 存储枚举字面量，SQL where 已按治理白名单过滤，边界处收窄类型
  const cards = (await prisma.mentorKnowledgeCard.findMany({
    where: {
      mentorId,
      knowledgeClass: { in: getRetrievableClasses() },
      disclosureMode: { not: 'none' },
    },
    select: {
      cardId: true,
      mentorId: true,
      domain: true,
      title: true,
      caseText: true,
      coreView: true,
      reasoning: true,
      applicableTo: true,
      notApplicableTo: true,
      prerequisites: true,
      exceptions: true,
      risks: true,
      knowledgeClass: true,
      disclosureMode: true,
      validFrom: true,
      reviewAfter: true,
      version: true,
    },
  })) as KnowledgeCardLike[];

  const tokens = tokenizeQuery(query);

  return cards
    .filter(isEffective)
    .map((card) => ({ card, score: scoreCard(card, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.card);
}

/**
 * 构建导师分身 System Prompt（四层），返回最终 prompt 与命中 cardId（仅审计用）。
 */
export async function buildMentorSystemPrompt(
  mentor: Mentor,
  query: string,
  ctx: MentorChatContext
): Promise<{ systemPrompt: string; hitCardIds: string[] }> {
  const cards = await searchKnowledgeCards(mentor.id, query);
  const hitCardIds = cards.map((c) => c.cardId);
  const cardsText = formatKnowledgeCards(cards);

  const systemPrompt = assembleSystemPrompt({
    globalPolicy: getGlobalSystemPolicy(),
    mentorName: mentor.name,
    mentorProfilePublic: mentor.publicProfile || mentor.tagline,
    genderPronoun: mentor.gender === 'male' ? '他' : '她',
    userProfileConfirmed: ctx.userProfileConfirmed || PLACEHOLDER_NONE,
    assessmentContext: ctx.assessmentContext || PLACEHOLDER_NONE,
    conversationSummary: ctx.conversationSummary || PLACEHOLDER_NONE,
    currentTime: ctx.currentTime,
    domainRoute: ctx.domainRoute,
    evidencePolicy: ctx.evidencePolicy,
    allowedScope: ctx.allowedScope,
    retrievedCardsText: cardsText,
    persona: getMentorPersonaPrompt(mentor.id, mentor.personalityPrompt),
  });

  return { systemPrompt, hitCardIds };
}
