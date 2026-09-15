/**
 * 迷你脏话检查（仅用于用户自填资料字段：昵称、学校、焦虑描述等）
 *
 * 设计原则：
 *  - 聊天消息不走这里。聊天内容由大模型自身安全策略 + 领域门禁处理，
 *    避免词库式子串匹配误伤正常职业咨询（旧网易 UGC 词库曾把
 *    “时间/没有/希望”等常用词收入，导致约半数正常句子被误杀，已整库删除）
 *  - 词库 src/data/profanity-mini.json 手工维护，只收真正的脏话/侮辱词
 *  - 中文词条做归一化后子串匹配；英文词条做词边界匹配，
 *    避免 anal 误杀 analysis/analyst、ass 误杀 class 这类事故
 *  - 匹配前归一化（小写、去空白/标点/符号），防夹符号绕过
 */
import profanityMini from '@/data/profanity-mini.json';

const { zh: zhWords, en: enWords } = profanityMini as { zh: string[]; en: string[] };

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let enPattern: RegExp | null = null;

function getEnPattern(): RegExp {
  if (!enPattern) {
    // 英文词边界：前后不能是字母。中文/数字/串首尾都算边界
    enPattern = new RegExp(`(?<![a-z])(?:${enWords.map(escapeRegExp).join('|')})(?![a-z])`);
  }
  return enPattern;
}

/** 文本是否包含迷你脏话库中的词条 */
export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const stripped = normalize(text);
  if (!stripped) return false;

  // 英文：词边界匹配（同时覆盖 "fuck you" 原始 token 和 "fuck你" 紧贴形式）
  if (getEnPattern().test(stripped)) return true;
  const tokens = text.toLowerCase().match(/[a-z]+/g);
  if (tokens) {
    const tokenSet = new Set(tokens);
    for (const w of enWords) {
      if (tokenSet.has(w)) return true;
    }
  }

  // 中文：子串匹配
  for (const w of zhWords) {
    if (stripped.includes(w)) return true;
  }
  return false;
}
