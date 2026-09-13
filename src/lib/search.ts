/**
 * 导师关键词搜索（首页第三张卡片）
 *
 * 候选范围：已上线（!comingSoon）且排除 ai-guide 的行业导师。
 * 搜索内容：数据库公开知识卡 / 静态知识条目 / 标签 / 行业 /
 *          常见问题 / 一句话介绍 / 公开身份 / 姓名头衔。
 * 按匹配度取前 5，无命中不虚构结果，由页面引导去导师列表。
 */
import { prisma } from './prisma';
import { mentors, type Mentor } from './mentors';
import { tokenizeQuery } from './kb-scoring';

/** 卡片渲染所需的公开字段（不带 personalityPrompt 等内部配置） */
export interface MentorCardData {
  id: string;
  name: string;
  avatar: string;
  title: string;
  company: string;
  tagline: string;
  tags: string[];
  years: number | string;
}

export interface MentorSearchHit {
  mentor: MentorCardData;
  score: number;
  /** 命中位置（中文标签，用于结果页说明匹配依据） */
  reasons: string[];
}

const RESULT_LIMIT = 5;

// 命中来源权重（顺序即 reasons 的展示顺序）
const REASON_CARD = '知识卡';
const REASON_NAME = '名字/头衔';
const REASON_TAG = '标签/行业';
const REASON_KNOWLEDGE = '知识条目';
const REASON_QUESTION = '常见问题';
const REASON_INTRO = '导师介绍';

function countMatchedTokens(text: string, tokens: string[]): Set<string> {
  const lower = text.toLowerCase();
  return new Set(tokens.filter((t) => t && lower.includes(t)));
}

function toCardData(m: Mentor): MentorCardData {
  return {
    id: m.id,
    name: m.name,
    avatar: m.avatar,
    title: m.title,
    company: m.company,
    tagline: m.tagline,
    tags: m.tags,
    years: m.years,
  };
}

/**
 * 按关键词搜索已上线导师，匹配度最高前 5。
 * 无命中时返回空数组（调用方负责「引导去导师列表」的空态）。
 */
export async function searchMentors(rawQuery: string): Promise<MentorSearchHit[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const candidates = mentors.filter((m) => m.id !== 'ai-guide' && !m.comingSoon);
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  // 一次性取回全部候选导师的公开知识卡（approved/published + 公开范围）
  // 口径与导师对话检索 mentor-kb.ts 的 RETRIEVABLE_STATUSES 保持一致
  const cards = await prisma.mentorKnowledgeCard.findMany({
    where: {
      mentorId: { in: candidates.map((m) => m.id) },
      status: { in: ['approved', 'published'] },
      publicationScope: { in: ['public_generalized', 'public_exact'] },
    },
    select: {
      mentorId: true,
      domain: true,
      title: true,
      coreView: true,
      validFrom: true,
    },
  });

  const now = Date.now();
  const cardsByMentor = new Map<string, typeof cards>();
  for (const c of cards) {
    if (c.validFrom) {
      const ts = new Date(c.validFrom).getTime();
      if (Number.isFinite(ts) && ts > now) continue;
    }
    const list = cardsByMentor.get(c.mentorId) || [];
    list.push(c);
    cardsByMentor.set(c.mentorId, list);
  }

  const hits: MentorSearchHit[] = [];

  for (const mentor of candidates) {
    let score = 0;
    const reasonWeight: Record<string, number> = {};
    const addReason = (label: string, weight: number) => {
      reasonWeight[label] = Math.max(reasonWeight[label] || 0, weight);
    };
    const covered = new Set<string>();

    const mark = (matched: Set<string>, label: string, weight: number) => {
      if (matched.size === 0) return;
      score += weight * matched.size;
      addReason(label, weight);
      matched.forEach((t) => covered.add(t));
    };

    // 1. 数据库知识卡：权重 10
    const dbCards = cardsByMentor.get(mentor.id) || [];
    let dbHit = false;
    for (const c of dbCards) {
      const matched = countMatchedTokens(
        `${c.title}\n${c.domain}\n${c.coreView}`,
        tokens
      );
      if (matched.size > 0) {
        score += 10 * matched.size;
        matched.forEach((t) => covered.add(t));
        dbHit = true;
      }
    }
    if (dbHit) addReason(REASON_CARD, 10);

    // 2. 姓名 / 头衔：权重 9
    mark(
      countMatchedTokens(`${mentor.name} ${mentor.title}`, tokens),
      REASON_NAME,
      9
    );

    // 3. 标签 / 行业：权重 8
    mark(
      countMatchedTokens([...mentor.tags, mentor.industry].join('\n'), tokens),
      REASON_TAG,
      8
    );

    // 4. 静态知识条目：权重 6
    let staticHit = false;
    for (const entry of mentor.knowledgeEntries || []) {
      const matched = countMatchedTokens(
        [entry.category, entry.content, ...(entry.keywords || [])].join('\n'),
        tokens
      );
      if (matched.size > 0) {
        score += 6 * matched.size;
        matched.forEach((t) => covered.add(t));
        staticHit = true;
      }
    }
    if (staticHit) addReason(REASON_KNOWLEDGE, 6);

    // 5. 常见问题：权重 5
    mark(
      countMatchedTokens((mentor.suggestedQuestions || []).join('\n'), tokens),
      REASON_QUESTION,
      5
    );

    // 6. 一句话介绍 / 公开身份：权重 5
    mark(
      countMatchedTokens(`${mentor.tagline}\n${mentor.publicProfile || ''}`, tokens),
      REASON_INTRO,
      5
    );

    if (score <= 0) continue;

    // 覆盖率作为极小的次序修正：命中 token 种类越全越靠前
    score += (covered.size / tokens.length) * 0.1;

    const reasons = Object.entries(reasonWeight)
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label);

    hits.push({ mentor: toCardData(mentor), score, reasons });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT);
}
