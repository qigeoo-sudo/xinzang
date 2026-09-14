/**
 * 敏感词库构建脚本（黑盒处理：本脚本与构建产物均不向控制台打印词条原文）
 *
 * 数据源：scripts/data/netease-ugc-words.txt
 *   网易 UGC 过滤词库（konsheng/Sensitive-lexicon，MIT License）
 *   面向中国大陆 UGC 场景（昵称/评论），含时政、色情、暴恐、广告等分类
 *
 * 产物：
 *  - src/data/sensitive-words.json（多字词条数组，归一化后去重）
 *  - src/data/sensitive-words-single-char.json（单字黑名单数组）
 *
 * 清洗规则：
 *  - trim、去空行
 *  - 剔除长度 < 2 的词条（单字词歧义极高，容易误杀正常姓名）
 *  - 按小写去重（英文类词条大小写不敏感）
 *  - 白名单（职业称谓等）从词库剔除
 *
 * 单字黑名单（scripts/data/sensitive-words-single-char.txt）独立维护，
 * 运行时 matcher 只在归一化后输入长度==1 时启用，不影响多字判断。
 *
 * 用法：node scripts/build-sensitive-words.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'scripts', 'data', 'netease-ugc-words.txt');
const EN_SRC = join(root, 'scripts', 'data', 'english-bad-words-raw.txt');
const OUT = join(root, 'src', 'data', 'sensitive-words.json');
const OUT_SINGLE = join(root, 'src', 'data', 'sensitive-words-single-char.json');

const raw = readFileSync(SRC, 'utf-8');
const enRaw = readFileSync(EN_SRC, 'utf-8');

// 白名单（业务确认的高歧义正常词，如职业称谓），构建时剔除
const ALLOWLIST_PATH = join(root, 'scripts', 'data', 'sensitive-words-allowlist.txt');
const allowlist = new Set(
  readFileSync(ALLOWLIST_PATH, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.toLowerCase())
);

// 英文白名单（CMU 词库里的歧义词，如颜色/国家名/宗教称谓），构建时剔除
const EN_ALLOWLIST_PATH = join(root, 'scripts', 'data', 'english-allowlist.txt');
const enAllowlist = new Set(
  readFileSync(EN_ALLOWLIST_PATH, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.toLowerCase())
);

// 高风险单字黑名单：归一化后单独输出为 JSON，运行时 matcher 只在输入长度==1 时启用
const SINGLE_CHAR_PATH = join(root, 'scripts', 'data', 'sensitive-words-single-char.txt');
const singleCharBlocklist = readFileSync(SINGLE_CHAR_PATH, 'utf-8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.toLowerCase());

const seen = new Set();
const words = [];
let droppedEmpty = 0;
let droppedSingleChar = 0;
let droppedDup = 0;
let droppedAllow = 0;

for (const line of raw.split(/\r?\n/)) {
  const w = line.trim();
  if (!w) { droppedEmpty++; continue; }
  if (w.length < 2) { droppedSingleChar++; continue; }
  const key = w.toLowerCase();
  if (allowlist.has(key)) { droppedAllow++; continue; }
  if (seen.has(key)) { droppedDup++; continue; }
  seen.add(key);
  words.push(w);
}

// 英文词库合入（CMU bad-words-list），歧义词走英文白名单剔除
let enAdded = 0;
let enDroppedAllow = 0;
let enDroppedDup = 0;
for (const line of enRaw.split(/\r?\n/)) {
  const w = line.trim();
  if (!w) continue;
  if (w.length < 2) continue;
  const key = w.toLowerCase();
  if (enAllowlist.has(key)) { enDroppedAllow++; continue; }
  if (allowlist.has(key)) { enDroppedAllow++; continue; }
  if (seen.has(key)) { enDroppedDup++; continue; }
  seen.add(key);
  words.push(w);
  enAdded++;
}

// 按长度再按字典序，产物稳定可 diff
words.sort((a, b) => a.length - b.length || a.localeCompare(b, 'zh-Hans-CN'));

// ---- 归一化（与运行时 matcher 的输入归一化口径一致）----
function normalizeForMatch(text) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

// 词条归一化后再入 trie；归一化后为空/单字的剔除、再次去重
const normalizedWords = [];
const normalizedSeen = new Set();
for (const w of words) {
  const n = normalizeForMatch(w);
  if (n.length < 2) continue;
  if (allowlist.has(n)) { droppedAllow++; continue; }
  if (normalizedSeen.has(n)) continue;
  normalizedSeen.add(n);
  normalizedWords.push(n);
}

// 单字黑名单归一化后单独写入（去重，仅保留长度==1的归一化结果）
const normalizedSingleChar = [];
const singleSeen = new Set();
for (const w of singleCharBlocklist) {
  const n = normalizeForMatch(w);
  if (n.length !== 1) continue;
  if (singleSeen.has(n)) continue;
  singleSeen.add(n);
  normalizedSingleChar.push(n);
}
normalizedSingleChar.sort();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(normalizedWords), 'utf-8');
writeFileSync(OUT_SINGLE, JSON.stringify(normalizedSingleChar), 'utf-8');

// ---- 内部自检（DFA trie），仅输出数字与正常词，不输出违规词条 ----
function buildTrie(list) {
  const root = {};
  for (const w of list) {
    let node = root;
    for (const ch of w) {
      node[ch] = node[ch] || {};
      node = node[ch];
    }
    node.__end = true;
  }
  return root;
}
// 模拟运行时 matcher：单字走黑名单，多字走 trie
function contains(trie, singleSet, text) {
  const s = normalizeForMatch(text);
  if (!s) return false;
  if (s.length === 1) return singleSet.has(s);
  for (let i = 0; i < s.length; i++) {
    let node = trie;
    for (let j = i; j < s.length; j++) {
      const next = node[s[j]];
      if (!next) break;
      if (next.__end) return true;
      node = next;
    }
  }
  return false;
}
// 返回命中词长度，仅供构建期定位误杀，不回显违规词原文
function hitLength(trie, singleSet, text) {
  const s = normalizeForMatch(text);
  if (!s) return 0;
  if (s.length === 1) return singleSet.has(s) ? 1 : 0;
  for (let i = 0; i < s.length; i++) {
    let node = trie;
    for (let j = i; j < s.length; j++) {
      const next = node[s[j]];
      if (!next) break;
      if (next.__end) return j - i + 1;
      node = next;
    }
  }
  return 0;
}

const trie = buildTrie(normalizedWords);
const singleSet = new Set(normalizedSingleChar);

// 1) 从词库等距抽样约 100 条，包裹在正常文本中，必须全部命中
const STEP = Math.max(1, Math.floor(normalizedWords.length / 100));
let sampled = 0;
let sampledHit = 0;
let spacedHit = 0;
for (let i = 0; i < normalizedWords.length; i += STEP) {
  sampled++;
  const w = normalizedWords[i];
  if (contains(trie, singleSet, `你好${w}再见`)) sampledHit++;
  // 变体：词条逐字间插入空格/标点/符号，归一化后仍应命中
  const spaced = w.split('').join(' ·.!！ ');
  if (contains(trie, singleSet, `你好${spaced}再见`)) spacedHit++;
}

// 2) 正常昵称/姓名误杀检查（构造的正常词，打印安全；只附命中长度，不附违规词）
const normalNames = [
  '张伟', '王芳', '李娜', '刘洋', '陈杰', '杨洋', '赵敏', '黄磊', '周涛', '吴静',
  '小明同学', '职业规划师', 'HR老王', '产品经理小李', '咖啡不加糖', '风一样的男子',
  '考公路上的阿强', '国企打工人', '向阳而生', '爱做饭的设计师', 'Tom', 'Jerry',
  'Alex_Wang', '追梦人', '北纬30度', '程序媛小圆', '市场部阿May', '大橙子',
  '想转行的会计', '秋招加油', '社畜自救指南', '数据分析师阿凯',
  '母亲', '父母', '母子', '母女', '母语', '字母', '丈母娘', '岳母', '祖母', '舅母',
  '社畜', '畜牧业', '畜牧', '家畜', '畜产',
];
const falseHits = normalNames
  .map((n) => ({ name: n, hitLen: hitLength(trie, singleSet, n) }))
  .filter((x) => x.hitLen > 0);

// 3) 单字黑名单自检：每个单字独立命中
let singleHit = 0;
for (const c of normalizedSingleChar) {
  if (contains(trie, singleSet, c)) singleHit++;
}

// 4) 长度分布
const dist = {};
for (const w of normalizedWords) dist[w.length] = (dist[w.length] || 0) + 1;

console.log(JSON.stringify({
  output: 'src/data/sensitive-words.json',
  singleCharOutput: 'src/data/sensitive-words-single-char.json',
  totalWords: normalizedWords.length,
  singleCharWords: normalizedSingleChar.length,
  dropped: { empty: droppedEmpty, singleChar: droppedSingleChar, duplicate: droppedDup, allowlisted: droppedAllow },
  english: { added: enAdded, droppedAllow: enDroppedAllow, droppedDup: enDroppedDup },
  lengthDist: dist,
  sampledHitTest: `${sampledHit}/${sampled}`,
  spacedVariantHitTest: `${spacedHit}/${sampled}`,
  singleCharHitTest: `${singleHit}/${normalizedSingleChar.length}`,
  normalNameFalseHits: falseHits,
}, null, 2));
