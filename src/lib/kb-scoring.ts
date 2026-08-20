/**
 * 知识卡检索打分与格式化（纯函数，无 Prisma / 路径别名依赖）
 *
 * 供应用代码 (src/lib/mentor-kb.ts) 与独立评测脚本 (scripts/eval-mentor.ts) 复用。
 * 脚本用 tsx 运行，无法解析 @/ 别名，因此本文件保持零依赖、零别名。
 */

export interface KnowledgeCardLike {
  cardId: string;
  mentorId: string; // 对应 orchestrator 的 mentor_uid
  domain: string;
  title: string;
  coreView: string;
  reasoning?: string | null;
  applicableTo?: string | null;
  notApplicableTo?: string | null;
  prerequisites?: string | null;
  exceptions?: string | null;
  risks?: string | null;
  source?: string | null;
  confidence: string;
  status: string;
  publicationScope: string;
  validFrom?: string | null;
  reviewAfter?: string | null;
}

/** 中文 2-gram + 英文/数字词切分 */
export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  const lower = query.toLowerCase();

  for (const m of lower.match(/[a-z0-9]+/g) || []) {
    tokens.push(m);
  }

  for (const run of lower.match(/[\u4e00-\u9fa5]+/g) || []) {
    if (run.length < 2) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      tokens.push(run.slice(i, i + 2));
    }
  }

  return tokens;
}

/** 按字段权重打分 */
export function scoreCard(card: KnowledgeCardLike, tokens: string[]): number {
  let score = 0;
  const title = (card.title || '').toLowerCase();
  const domain = (card.domain || '').toLowerCase();
  const core = (card.coreView || '').toLowerCase();
  const when = (card.applicableTo || '').toLowerCase();
  const limits = (card.exceptions || '').toLowerCase();
  const reasoning = (card.reasoning || '').toLowerCase();

  for (const t of tokens) {
    if (!t) continue;
    if (title.includes(t)) score += 4;
    if (domain.includes(t)) score += 3;
    if (core.includes(t)) score += 1;
    if (when.includes(t)) score += 1;
    if (limits.includes(t)) score += 1;
    if (reasoning.includes(t)) score += 1;
  }

  return score;
}

/**
 * 将知识卡格式化为总调度 Prompt 的 {{retrieved_knowledge_cards}} 文本
 * 使用 orchestrator 能识别的目标字段词汇 (applicable_to / valid_from / status / publication_scope ...)
 */
export function formatKnowledgeCards(cards: KnowledgeCardLike[]): string {
  if (cards.length === 0) {
    return '（本轮无检索到的知识卡）';
  }
  const blocks = cards.map((c, i) => {
    const lines: string[] = [];
    lines.push(
      `【卡${i + 1}】card_id: ${c.cardId} | mentor_uid: ${c.mentorId} | status: ${c.status} | publication_scope: ${c.publicationScope} | confidence: ${c.confidence}` +
        (c.validFrom ? ` | valid_from: ${c.validFrom}` : '')
    );
    lines.push(`领域: ${c.domain}`);
    lines.push(`标题: ${c.title}`);
    lines.push(`核心观点: ${c.coreView}`);
    if (c.reasoning) lines.push(`理由: ${c.reasoning}`);
    lines.push(`applicable_to: ${c.applicableTo || '未标注'}`);
    lines.push(`not_applicable_to: ${c.notApplicableTo || '未标注'}`);
    lines.push(`prerequisites: ${c.prerequisites || '未标注'}`);
    lines.push(`exceptions: ${c.exceptions || '未标注'}`);
    lines.push(`risks: ${c.risks || '未标注'}`);
    if (c.reviewAfter) lines.push(`review_after: ${c.reviewAfter}`);
    if (c.source) lines.push(`来源: ${c.source}`);
    return lines.join('\n');
  });
  return blocks.join('\n\n');
}
