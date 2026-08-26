/**
 * 导师知识库检索 + 三层 System Prompt 组装（数据库知识卡版本）
 *
 * 三层架构：
 * 1. 平台硬约束 Prompt（prompts.ts，全局最高优先级）
 * 2. 导师人格 Prompt（mentor.personalityPrompt）
 * 3. 专业知识总调度 Prompt（prompts.ts，注入变量）
 *
 * 知识卡与风格 Prompt 分开管理；审核稿、访谈工作底稿、评测题不进入知识卡检索。
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

export type { KnowledgeCardLike };

// 生产聊天只检索已确认知识卡。
// candidate/draft/hold_for_round2/mentor_unconfirmed 只能走隔离的内部测试链路，
// 不能在正常聊天中交给模型“自行判断是否可用”。
const RETRIEVABLE_STATUSES = [
  'approved',
  'published',
];

const USER_VISIBLE_SCOPES = new Set([
  'public_exact',
  'public_generalized',
]);

/** 聊天上下文（由 route 注入，用于总调度变量） */
export interface MentorChatContext {
  userProfileConfirmed: string;
  userProfileInferred?: string;
  assessmentContext?: string;
  conversationSummary?: string;
  currentTime: string;
  domainRoute?: string;
  evidencePolicy?: string;
  allowedScope?: string;
}

function isUserPublishableCard(card: KnowledgeCardLike): boolean {
  const compatCard = card as KnowledgeCardLike & {
    publicationScope?: string | null;
    validFrom?: Date | string | null;
  };
  const scope = compatCard.publicationScope;

  // 兼容旧卡：历史 approved/published 卡若尚未填 publicationScope，
  // 不在本次无 Schema 迁移中强制拦截；但已明确标为内部或排除的必须拦截。
  if (scope && !USER_VISIBLE_SCOPES.has(scope)) return false;

  if (compatCard.validFrom) {
    const validFrom = new Date(compatCard.validFrom).getTime();
    if (Number.isFinite(validFrom) && validFrom > Date.now()) return false;
  }

  return true;
}

/**
 * 关键词检索数据库知识卡，按分数降序取 Top N
 */
export async function searchKnowledgeCards(
  mentorId: string,
  query: string,
  topN: number = 4
): Promise<KnowledgeCardLike[]> {
  const cards = await prisma.mentorKnowledgeCard.findMany({
    where: {
      mentorId,
      status: { in: RETRIEVABLE_STATUSES },
    },
    select: {
      cardId: true,
      mentorId: true,
      domain: true,
      title: true,
      coreView: true,
      reasoning: true,
      applicableTo: true,
      notApplicableTo: true,
      prerequisites: true,
      exceptions: true,
      risks: true,
      source: true,
      confidence: true,
      status: true,
      publicationScope: true,
      validFrom: true,
      reviewAfter: true,
    },
  });

  const tokens = tokenizeQuery(query);

  return cards
    .filter(isUserPublishableCard)
    .map((card) => ({ card, score: scoreCard(card, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.card);
}

/**
 * 构建导师分身三层 System Prompt（数据库知识卡版本）
 * 返回最终 prompt 与命中的 card_id 列表（用于命中记录）
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
    mentorName: mentor.name,
    mentorProfilePublic: mentor.publicProfile || mentor.tagline,
    userProfileConfirmed: ctx.userProfileConfirmed || PLACEHOLDER_NONE,
    userProfileInferred: ctx.userProfileInferred || PLACEHOLDER_NONE,
    assessmentContext: ctx.assessmentContext || PLACEHOLDER_NONE,
    conversationSummary: ctx.conversationSummary || PLACEHOLDER_NONE,
    currentTime: ctx.currentTime,
    domainRoute: ctx.domainRoute,
    evidencePolicy: ctx.evidencePolicy,
    allowedScope: ctx.allowedScope,
    retrievedCardsText: cardsText,
    persona: mentor.personalityPrompt,
  });

  return { systemPrompt, hitCardIds };
}
