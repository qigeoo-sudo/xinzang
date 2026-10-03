/**
 * 一次性给 journeys.json 的 32 位抽样用户补 phone（完整 11 位 demo 号）+ name。
 * 确定性：同一 id 永远得到同一身份，与 gen-admin-entity-demo 同款 mulberry32。
 * 运行：node scripts/gen-journey-identity.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'public/demo/admin/journeys.json';

function mulberry32(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURNAMES = ['陈', '李', '张', '王', '刘', '黄', '吴', '周', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '董', '程', '曹'];
const GIVEN2 = ['子涵', '欣怡', '梓萱', '雨泽', '浩然', '诗涵', '一诺', '亦可', '梦琪', '嘉怡', '思远', '若曦', '沐阳', '知许', '星野', '清扬', '安然', '书瑶', '景行', '南乔', '砚秋', '听澜', '望舒', '怀瑾'];
const GIVEN1 = ['然', '远', '安', '秋', '辰', '曦', '野', '许', '行', '瑾'];
// 含短名（2 字符）用于覆盖「钓*」式只露头的分支
const EN_NAMES = ['Aaron', 'Ivy', 'Leo', 'Mira', 'Ethan', 'Nora', 'Owen', 'Quinn', 'Aria', 'Finn', 'Yara', 'Zoe', 'Brian', 'Diana', 'Evan', 'Henry', 'Iris', 'Jason', 'Fay', 'Al'];
const PREFIXES = ['135', '138', '150', '158', '159', '176', '186', '188', '199', '133'];

const j = JSON.parse(readFileSync(PATH, 'utf8'));
for (const u of j.users) {
  const rnd = mulberry32(`journey-id:${u.id}`);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const prefix = pick(PREFIXES);
  const tail = String(Math.floor(rnd() * 1e8)).padStart(8, '0'); // 8 位，拼前缀共 11 位
  u.phone = prefix + tail;
  // 约 25% 英文名，其余中文（其中约两成为单字名 → 整体 2 字）
  if (rnd() < 0.25) {
    u.name = pick(EN_NAMES);
  } else {
    u.name = pick(SURNAMES) + (rnd() < 0.2 ? pick(GIVEN1) : pick(GIVEN2));
  }
}

writeFileSync(PATH, JSON.stringify(j, null, 2) + '\n');
console.log(`已为 ${j.users.length} 位行为链用户补全 phone/name`);
