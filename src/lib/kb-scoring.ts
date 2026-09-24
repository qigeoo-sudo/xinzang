/**
 * 知识卡检索打分与格式化（纯函数，无 Prisma / 路径别名依赖）
 *
 * 供应用代码 (src/lib/mentor-kb.ts、src/lib/search.ts) 与测试脚本复用。
 * 脚本用 tsx 运行，无法解析 @/ 别名，因此本文件保持零依赖、零别名。
 *
 * 安全约束（handoff 2026-09-15 §10）：
 * - 检索打分可以使用 title/domain/coreView 等全部文本字段；
 * - 但格式化给回答模型的内容只允许 coreView / reasoning / caseText 与适用边界；
 * - 编号、cardId、domain、title、confidence、source、分数、版本一律不得进入模型上下文。
 */
import type { KnowledgeClass, DisclosureMode } from './kb-governance';

export interface KnowledgeCardLike {
  cardId: string;
  mentorId: string;
  schemaVersion?: string;
  domain: string;
  title: string;
  caseText?: string | null;
  coreView: string;
  reasoning?: string | null;
  applicableTo?: string | null;
  notApplicableTo?: string | null;
  prerequisites?: string | null;
  exceptions?: string | null;
  risks?: string | null;
  knowledgeClass: KnowledgeClass;
  disclosureMode: DisclosureMode;
  validFrom?: string | null;
  reviewAfter?: string | null;
  version?: string | null;
}

/** 中文 2-gram + 英文/数字词切分 */
export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  const lower = query.toLowerCase();

  for (const m of lower.match(/[a-z0-9]+/g) || []) {
    tokens.push(m);
  }

  for (const run of lower.match(/[一-龥]+/g) || []) {
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

/** 按字段权重打分（仅用于召回排序，分数本身不进入模型上下文） */
export function scoreCard(card: KnowledgeCardLike, tokens: string[]): number {
  let score = 0;
  const title = (card.title || '').toLowerCase();
  const domain = (card.domain || '').toLowerCase();
  const core = (card.coreView || '').toLowerCase();
  const when = (card.applicableTo || '').toLowerCase();
  const limits = (card.exceptions || '').toLowerCase();
  const reasoning = (card.reasoning || '').toLowerCase();
  const caseText = (card.caseText || '').toLowerCase();

  for (const t of tokens) {
    if (!t) continue;
    if (title.includes(t)) score += 4;
    if (domain.includes(t)) score += 3;
    if (core.includes(t)) score += 1;
    if (when.includes(t)) score += 1;
    if (limits.includes(t)) score += 1;
    if (reasoning.includes(t)) score += 1;
    if (caseText.includes(t)) score += 1;
  }

  return score;
}

/**
 * 把已准入知识卡组装为无编号、无字段名、无内部元数据的自然语言段落。
 *
 * 只输出 handoff §10 允许的内容：coreView / reasoning / caseText /
 * applicableTo / prerequisites / exceptions / risks / notApplicableTo。
 * 不输出 cardId、domain、title、confidence、source、分数、版本、编号、字段标签。
 */
export function formatKnowledgeCards(cards: KnowledgeCardLike[]): string {
  if (cards.length === 0) {
    return '（本轮没有检索到可使用的参考材料）';
  }

  const paragraphs = cards.map((c) => {
    const parts: string[] = [];

    // 案例卡：先案例正文，再导师评点，最后提炼结论；普通观点卡：核心观点 + 理由
    if (c.caseText && c.caseText.trim()) {
      parts.push(c.caseText.trim());
      if (c.reasoning) parts.push(c.reasoning.trim());
      parts.push(c.coreView.trim());
    } else {
      parts.push(c.coreView.trim());
      if (c.reasoning) parts.push(c.reasoning.trim());
    }

    // 边界用自然连接词给出，不使用 schema 字段名或"标题/观点"类标签
    if (c.applicableTo) parts.push(`这一看法适用于：${c.applicableTo.trim()}`);
    if (c.prerequisites) parts.push(`成立的前提是：${c.prerequisites.trim()}`);
    if (c.notApplicableTo) parts.push(`不适用于：${c.notApplicableTo.trim()}`);
    if (c.exceptions) parts.push(`需要注意的例外：${c.exceptions.trim()}`);
    if (c.risks) parts.push(`相关风险边界：${c.risks.trim()}`);

    return parts.join('\n');
  });

  return [
    '以下是与当前话题相关的内部参考材料，供你自然吸收后用自己的话回答。',
    '不要引用或暗示材料的编号、来源、字段、分类或内部结构，也不要说"根据材料""知识卡显示"之类的话。',
    '',
    paragraphs.join('\n\n'),
  ].join('\n');
}
