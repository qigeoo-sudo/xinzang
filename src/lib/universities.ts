/**
 * 高校搜索匹配器
 *
 * 数据源：src/data/universities.json（3033 所，含大陆 2868 + 港澳台 165 + 双一流简称/英文缩写）
 * 构建：scripts/build-universities.mjs
 *
 * 口径：
 *  - 输入 ≥2 字符触发搜索（中英文均可）
 *  - 三层匹配：① 简称精确匹配 ② 英文缩写精确匹配（不区分大小写） ③ 中文校名子串匹配
 *  - 相似度排序：简称/英文缩写命中 > 前缀命中 > 中部命中；同优先级时名字短的优先
 *  - 限制返回数量，默认 20 条
 *  - 前端动态 import 按需加载，避免拖大首屏包
 */
import universities from '@/data/universities.json';

export interface University {
  name: string;
  province: string;
  location: string;
  level: string; // 本科 | 专科
  abbr?: string; // 中文简称（如"北大"），仅双一流收录
  enAbbr?: string; // 英文缩写（如"PKU"），仅双一流收录
}

export interface UniversitySearchResult extends University {
  /** 匹配类型：0=简称精确 / 1=英文缩写精确 / 2=前缀命中 / 3=中部命中 */
  matchKind: 0 | 1 | 2 | 3;
  /** 仅子串匹配时有效：输入在结果名中的起始位置 */
  matchIndex: number;
  /** 名字长度（越短优先级越高） */
  nameLength: number;
}

const MIN_QUERY_LEN = 2;
const DEFAULT_LIMIT = 20;

/**
 * 搜索高校。输入 < 2 字符返回空数组（不触发搜索）。
 *
 * 排序规则：
 *  1. 简称精确命中（matchKind=0）最优先
 *  2. 英文缩写精确命中（matchKind=1）次优先
 *  3. 前缀命中（matchKind=2，matchIndex=0）再次之
 *  4. 中部命中（matchKind=3）最后
 *  5. 同优先级时名字短的优先
 *  6. 都相同时按 province 字母序兜底稳定排序
 */
export function searchUniversities(query: string, limit: number = DEFAULT_LIMIT): UniversitySearchResult[] {
  const q = (query || '').trim();
  if (q.length < MIN_QUERY_LEN) return [];
  const qLower = q.toLowerCase();

  const results: UniversitySearchResult[] = [];
  for (const u of universities as University[]) {
    // ① 简称精确匹配
    if (u.abbr && u.abbr === q) {
      results.push({ ...u, matchKind: 0, matchIndex: -1, nameLength: u.name.length });
      continue;
    }
    // ② 英文缩写精确匹配（不区分大小写）
    if (u.enAbbr && u.enAbbr.toLowerCase() === qLower) {
      results.push({ ...u, matchKind: 1, matchIndex: -1, nameLength: u.name.length });
      continue;
    }
    // ③ 中文校名子串匹配
    const name = u.name.toLowerCase();
    const idx = name.indexOf(qLower);
    if (idx === -1) continue;
    results.push({
      ...u,
      matchKind: idx === 0 ? 2 : 3,
      matchIndex: idx,
      nameLength: u.name.length,
    });
  }

  results.sort((a, b) => {
    if (a.matchKind !== b.matchKind) return a.matchKind - b.matchKind;
    if (a.matchKind === 2 || a.matchKind === 3) {
      if (a.matchIndex !== b.matchIndex) return a.matchIndex - b.matchIndex;
    }
    if (a.nameLength !== b.nameLength) return a.nameLength - b.nameLength;
    return a.province.localeCompare(b.province);
  });

  return results.slice(0, limit);
}

/**
 * 校验输入的学校名是否在名单中。命中返回 true，否则 false。
 * 用于后端兜底校验（前端允许"不在名单里"选项，后端可选严格模式）。
 */
export function isKnownUniversity(name: string): boolean {
  const n = (name || '').trim();
  if (!n) return false;
  return (universities as University[]).some((u) => u.name === n);
}
