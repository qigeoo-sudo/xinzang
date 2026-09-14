// 合并大陆 + 港澳台高校名单 + 双一流简称/英文缩写，输出 src/data/universities.json
// 输入：
//   - scripts/data/universities-cn.json（教育部 2024 大陆名单，2868 所）
//   - scripts/data/universities-hk-macau-tw.txt（港澳台手工整理）
//   - scripts/data/universities-alias.tsv（双一流简称+英文缩写映射）
// 输出：src/data/universities.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const CN_SRC = join(root, 'scripts', 'data', 'universities-cn.json');
const HMT_SRC = join(root, 'scripts', 'data', 'universities-hk-macau-tw.txt');
const ALIAS_SRC = join(root, 'scripts', 'data', 'universities-alias.tsv');
const OUT = join(root, 'src', 'data', 'universities.json');

// 大陆名单
const cnList = JSON.parse(readFileSync(CN_SRC, 'utf-8'));
console.log(`[CN] parsed from json: ${cnList.length} entries`);

// 港澳台名单
const hmtRaw = readFileSync(HMT_SRC, 'utf-8');
const hmtList = hmtRaw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [name, province, level] = l.split('|').map((s) => s.trim());
    return { name, province: province || '', location: province || '', level: level || '本科' };
  });
console.log(`[HMT] parsed from txt: ${hmtList.length} entries`);

// 简称/英文缩写映射
const aliasRaw = readFileSync(ALIAS_SRC, 'utf-8');
const aliasMap = new Map(); // 全称 → { abbr, enAbbr }
let aliasCount = 0;
for (const line of aliasRaw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [name, abbr, enAbbr] = trimmed.split('|').map((s) => (s ?? '').trim());
  if (!name) continue;
  aliasMap.set(name, { abbr: abbr || '', enAbbr: (enAbbr || '').toUpperCase() || '' });
  aliasCount++;
}
console.log(`[ALIAS] parsed from tsv: ${aliasCount} entries`);

// 合并 + 去重（按 name 唯一），合入简称/英文缩写
const seen = new Set();
const merged = [];
for (const u of [...cnList, ...hmtList]) {
  if (!u.name || seen.has(u.name)) continue;
  seen.add(u.name);
  const alias = aliasMap.get(u.name);
  merged.push({
    ...u,
    abbr: alias?.abbr || '',
    enAbbr: alias?.enAbbr || '',
  });
}
console.log(`[MERGED] unique universities: ${merged.length} (deduped ${cnList.length + hmtList.length - merged.length})`);

// 校验别名表是否有全称未匹配到主名单（提示手工核对）
const unmatchedAlias = [];
for (const [name] of aliasMap) {
  if (!seen.has(name)) unmatchedAlias.push(name);
}
if (unmatchedAlias.length > 0) {
  console.warn(`[WARN] ${unmatchedAlias.length} alias entries not matched in main list (first 5 shown):`);
  for (const n of unmatchedAlias.slice(0, 5)) console.warn(`  - ${n}`);
}

// 统计：含简称/英文缩写的学校数量
const abbrCount = merged.filter((u) => u.abbr).length;
const enAbbrCount = merged.filter((u) => u.enAbbr).length;
console.log(`[STATS] with abbr: ${abbrCount} / ${merged.length}`);
console.log(`[STATS] with enAbbr: ${enAbbrCount} / ${merged.length}`);

// 按省份分布统计（不打印具体校名，避免上下文泄露）
const byProvince = {};
for (const u of merged) {
  byProvince[u.province] = (byProvince[u.province] || 0) + 1;
}
console.log('[STATS] province distribution (counts only):');
for (const [p, c] of Object.entries(byProvince)) {
  console.log(`  ${p}: ${c}`);
}

// 按字数分布统计
const byNameLen = {};
for (const u of merged) {
  const len = u.name.length;
  byNameLen[len] = (byNameLen[len] || 0) + 1;
}
console.log('[STATS] name length distribution:');
for (const [len, c] of Object.entries(byNameLen).sort((a, b) => a[0] - b[0])) {
  console.log(`  ${len} chars: ${c}`);
}

writeFileSync(OUT, JSON.stringify(merged), 'utf8');
console.log(`[OUT] ${OUT}`);
console.log(`[DONE] total: ${merged.length} universities`);

