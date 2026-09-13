/**
 * RIASEC 计分（题库 v0.3，每维 10 题）
 * 每个维度：原始均分映射到 0-100（全打 1 分→0，全打 5 分→100）
 * 主码 = 得分最高的三个维度字母（如 SIA）；
 * 若第三名出现同分，则并列全部展示（如 SEAC），不强行截断成唯一三码
 */
import { DIMENSIONS, type Dimension, type RiasecQuestion } from './questions';

export interface AnswerItem {
  qid: string;
  value: number; // 1-5
}

export interface ScoreResult {
  scores: Record<Dimension, number>;
  /** 前三码，如 "SIA" */
  code: string;
}

export function scoreAnswers(
  questions: readonly RiasecQuestion[],
  answers: readonly AnswerItem[]
): ScoreResult {
  const dimOf: Record<string, Dimension> = {};
  for (const q of questions) dimOf[q.id] = q.dim;

  const sums = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;
  const counts = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;

  for (const a of answers) {
    const dim = dimOf[a.qid];
    if (!dim) continue;
    sums[dim] += a.value;
    counts[dim] += 1;
  }

  const scores = Object.fromEntries(
    DIMENSIONS.map((d) => {
      if (counts[d] === 0) return [d, 0];
      const pct = ((sums[d] - counts[d]) / (4 * counts[d])) * 100;
      return [d, Math.round(pct)];
    })
  ) as Record<Dimension, number>;

  const ranked = DIMENSIONS.slice().sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b); // 同分按 R I A S E C 固定序
  });

  // 前两位必入选；第三位及与之同分的维度全部并列入选
  const thirdScore = scores[ranked[2]];
  const code = ranked
    .filter((d, i) => i < 2 || scores[d] === thirdScore)
    .join('');

  return { scores, code };
}
