/**
 * 敏感词本地匹配（DFA / Trie + 单字黑名单）
 *
 * 词库：src/data/sensitive-words.json，由 scripts/build-sensitive-words.mjs 从
 * 网易 UGC 过滤词库（MIT）清洗生成，白名单维护见 scripts/data/sensitive-words-allowlist.txt。
 *
 * 口径：
 *  - 前后端共用同一实现；前端通过动态 import 按需加载，避免拖大首屏包
 *  - 匹配前对输入归一化（小写、去空白/标点/符号），防"字 字"夹符号的简单绕过
 *  - 仅做子串命中，不做拼音/谐音识别（需要时再升级云审核）
 *  - 单字黑名单（scripts/data/sensitive-words-single-char.txt）只在归一化后输入长度==1 时生效
 *  - 多字输入走 trie（词库本身不含单字），由词库本身决定是否拦截
 *  - findSensitiveWord 仅供服务端日志排查，禁止把命中词回显给最终用户
 */
import wordList from '@/data/sensitive-words.json';
import singleCharBlocklist from '@/data/sensitive-words-single-char.json';

type TrieNode = { [char: string]: TrieNode | undefined } & { __end?: true };

let trieCache: TrieNode | null = null;
let singleCharSet: Set<string> | null = null;

function normalizeInput(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function buildTrie(words: string[]): TrieNode {
  const root: TrieNode = {};
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      let next = node[ch];
      if (!next) {
        next = {};
        node[ch] = next;
      }
      node = next;
    }
    node.__end = true;
  }
  return root;
}

function getTrie(): TrieNode {
  if (!trieCache) {
    trieCache = buildTrie(wordList as string[]);
  }
  return trieCache;
}

function getSingleCharSet(): Set<string> {
  if (!singleCharSet) {
    singleCharSet = new Set(singleCharBlocklist as string[]);
  }
  return singleCharSet;
}

/** 文本是否包含敏感词 */
export function containsSensitiveWord(text: string): boolean {
  return findSensitiveWord(text) !== null;
}

/**
 * 返回命中的敏感词。
 * 注意：结果只能用于服务端日志/统计，不要展示给用户（界面只提示"含违规内容"）。
 */
export function findSensitiveWord(text: string): string | null {
  if (!text) return null;
  const s = normalizeInput(text);
  if (!s) return null;
  // 单字输入：查单字黑名单
  if (s.length === 1) {
    return getSingleCharSet().has(s) ? s : null;
  }
  // 多字输入：走 trie（词库不含单字，自然不会因子串命中单字而误杀）
  const trie = getTrie();
  for (let i = 0; i < s.length; i++) {
    let node: TrieNode | undefined = trie;
    for (let j = i; j < s.length; j++) {
      node = node[s[j]];
      if (!node) break;
      if (node.__end) return s.slice(i, j + 1);
    }
  }
  return null;
}
