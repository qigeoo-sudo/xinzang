/**
 * 导师关键词搜索（首页第三张卡片）
 *
 * 候选范围：已上线（!comingSoon）的行业导师。
 * 只在人工提炼的短文本上匹配：知识卡标题/领域、静态条目关键词/分类、
 * 标签/行业、姓名头衔、常见问题、一句话介绍。
 * 不扫知识卡正文（coreView）、条目正文（content）和长简介，
 * 避免双字组合在长文里误命中；查询中的高频通用词先停用过滤。
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

/**
 * 中文高频通用双字词 — 在短文本上也没有区分度，不参与搜索。
 * 只收虚词/泛指词，职业领域词（如「工作」「职业」「能力」「经历」）不在此列。
 * 英文/数字 token（HR、AI、MBB、2026）不受此表限制。
 */
const STOPWORD_BIGRAMS = new Set<string>([
  // 代词/指示
  '我们', '他们', '她们', '咱们', '自己', '大家', '人家',
  '这个', '那个', '这些', '那些', '这样', '那样',
  // 疑问/语气
  '什么', '怎么', '怎样', '如何', '为何', '为什么',
  '请问', '你好', '谢谢', '大佬', '大神', '好吗', '吗呢',
  // 情态/连接/副词
  '可以', '应该', '应当', '必须', '需要', '可能',
  '或者', '但是', '不过', '因为', '所以', '如果', '虽然', '然后',
  '就是', '还是', '已经', '正在', '立刻', '马上',
  '比较', '非常', '十分', '特别', '真的', '其实', '直接',
  '一直', '一定', '一样',
  // 时间/泛指名词
  '目前', '现在', '今天', '明天', '昨天', '最近',
  '后来', '以后', '之前', '时候', '地方', '东西', '事情',
  '问题', '方面',
  // 介词/泛指动词
  '相关', '关于', '对于', '通过', '进行',
  '知道', '觉得', '认为', '看到', '听到',
  // 数量/否定/其他高频
  '一下', '一个', '没有', '不会', '不要', '不能', '不是',
  '以及', '等等', '存在',
]);

/**
 * 有效搜索 token 过滤：
 * - 含字母的至少 2 个字母（HR、AI、MBB、Case 保留，单个碎片字母丢弃）
 * - 纯数字至少 2 位（2026 保留，「从0到1」切出的 0/1 丢弃）
 * - 纯中文至少 2 字（bigram 保留，被数字/英文切断的单字丢弃）
 * 再通过通用词停用表剔除无区分度的双字虚词。
 */
function isEffectiveToken(token: string): boolean {
  if (/[a-z]/.test(token)) {
    return (token.match(/[a-z]/g) || []).length >= 2;
  }
  if (/^[0-9]+$/.test(token)) {
    return token.length >= 2;
  }
  return token.length >= 2 && !STOPWORD_BIGRAMS.has(token);
}

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

  const candidates = mentors.filter((m) => !m.comingSoon);
  // 过滤碎片 token 和通用词后若没有有效 token（如只搜「如何」「从0到1」），直接无结果
  const tokens = tokenizeQuery(query).filter(isEffectiveToken);
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
        `${c.title}\n${c.domain}`,
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
        [entry.category, ...(entry.keywords || [])].join('\n'),
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

    // 6. 一句话介绍：权重 5
    mark(
      countMatchedTokens(mentor.tagline, tokens),
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
