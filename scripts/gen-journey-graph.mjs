/**
 * 生成 public/demo/admin/journey-graph.json —— 行为链拓扑图的大数量级演示数据。
 * 方法：以 journeys.json（32 位抽样用户）的事件流为「跳转结构骨架」，
 *       按 pages.json（各页 PV/UV）与 ctas.json（各按钮点击量）的总量锚定放大。
 * 确定性：mulberry32 固定种子，重复运行输出一致。
 * 运行：node scripts/gen-journey-graph.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pages = load('public/demo/admin/pages.json');
const ctas = load('public/demo/admin/ctas.json');
const journeys = load('public/demo/admin/journeys.json');

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
const rnd = mulberry32('journey-graph:v2');
const jitter = (lo, hi) => lo + rnd() * (hi - lo);
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// ---------- 1. 从 32 人抽样提取跳转结构（骨架） ----------
const patPV = new Map();        // path -> page.view 次数
const patBtn = new Map();       // label -> Map<page, {count, landings: Map<target,count>}>
const patEdge = new Map();      // `src|tgt` -> count（页面直连）
const MENTOR_RE = /^\/mentors\/(?!\[id\])(.+)$/;
const mentorCards = new Map();  // slug -> 卡片点击数（按按钮标签里的导师名归属）

for (const u of journeys.users) {
  for (const sess of u.sessions) {
    let prevPage = null;
    let pendingBtn = null; // { key, page }
    for (const ev of sess.events) {
      if (ev.type === 'page.view' && ev.page) {
        const p = ev.page;
        patPV.set(p, (patPV.get(p) ?? 0) + 1);
        if (pendingBtn) {
          const landings = patBtn.get(pendingBtn.label)?.get(pendingBtn.page)?.landings;
          if (landings && pendingBtn.page !== p) landings.set(p, (landings.get(p) ?? 0) + 1);
          pendingBtn = null;
        } else if (prevPage && prevPage !== p) {
          const k = `${prevPage}|${p}`;
          patEdge.set(k, (patEdge.get(k) ?? 0) + 1);
        }
        prevPage = p;
      } else if (ev.label && prevPage) {
        const cardM = ev.label.match(/^导师卡片 · (.+)$/);
        if (cardM) {
          // 卡片点击按标签里的导师名归属：Lydia Chen -> lydiachen
          const slug = cardM[1].toLowerCase().replace(/\s+/g, '');
          mentorCards.set(slug, (mentorCards.get(slug) ?? 0) + 1);
        } else {
          if (!patBtn.has(ev.label)) patBtn.set(ev.label, new Map());
          const perPage = patBtn.get(ev.label);
          if (!perPage.has(prevPage)) perPage.set(prevPage, { count: 0, landings: new Map() });
          perPage.get(prevPage).count += 1;
        }
        pendingBtn = { label: ev.label, page: prevPage };
      }
    }
  }
}

// ---------- 2. 页面节点：11 个主页面 + 导师主页拆 8 真人 + 40 长尾 ----------
const mainPages = pages.pages.filter((p) => p.path !== '/mentors/[id]');
const mentorTarget = pages.pages.find((p) => p.path === '/mentors/[id]'); // views 5840 / uv 2050
const knownSlugs = [...patPV.keys()].map((p) => p.match(MENTOR_RE)?.[1]).filter(Boolean).sort();
const TAIL_COUNT = 40;
const tailPV = Array.from({ length: TAIL_COUNT }, () => rint(15, 55));
const tailTotal = tailPV.reduce((a, b) => a + b, 0);
const patMentorSum = knownSlugs.reduce((a, s) => a + (patPV.get(`/mentors/${s}`) ?? 0), 0) || 1;
const knownScale = (mentorTarget.views - tailTotal) / patMentorSum;

const outPages = [];
const pageFactor = new Map(); // path -> 放大系数（用于非 ctas 按钮/页面直连边）
for (const p of mainPages) {
  outPages.push({ id: p.path, label: p.label, pv: p.views, uv: p.uniqueVisitors, main: true });
  pageFactor.set(p.path, p.views / Math.max(1, patPV.get(p.path) ?? 1));
}
for (const s of knownSlugs) {
  const pv = Math.max(20, Math.round((patPV.get(`/mentors/${s}`) ?? 1) * knownScale * jitter(0.85, 1.15)));
  outPages.push({ id: `/mentors/${s}`, label: '导师主页', sub: s, pv, uv: Math.round(pv * (mentorTarget.uniqueVisitors / mentorTarget.views) * jitter(0.9, 1.1)), main: false });
  pageFactor.set(`/mentors/${s}`, pv / Math.max(1, patPV.get(`/mentors/${s}`) ?? 1));
}
for (let i = 0; i < TAIL_COUNT; i++) {
  const id = `/mentors/x${String(i + 1).padStart(2, '0')}`;
  outPages.push({ id, label: '导师主页', sub: `x${String(i + 1).padStart(2, '0')}`, pv: tailPV[i], uv: Math.round(tailPV[i] * jitter(0.28, 0.42)), main: false, tail: true });
  pageFactor.set(id, 1);
}

// ---------- 3. 按钮与边 ----------
const outButtons = []; // { key, label, page, clicks, users }
const outEdges = [];   // { source, sourceHandle, kind, target, count, users }
const btnKey = new Map(); // `${page}::${label}` -> key
function addButton(page, label, clicks, users) {
  const k = `${page}::${label}`;
  if (btnKey.has(k)) return btnKey.get(k);
  const key = `b${btnKey.size + 1}`;
  btnKey.set(k, key);
  outButtons.push({ key, label, page, clicks, users });
  return key;
}
const ctasByLabel = new Map();
for (const c of [...ctas.spotlight, ...ctas.others]) ctasByLabel.set(c.label, c);

// 3a. 按钮：ctas 锚定的按全局占比分摊到各页；其余按页面系数放大
for (const [label, perPage] of patBtn) {
  const ct = ctasByLabel.get(label);
  const patTotal = [...perPage.values()].reduce((a, b) => a + b.count, 0) || 1;
  // 该按钮的全局去向：ctas destinations 优先，否则 pattern 落地页合计
  let dests;
  if (ct && ct.topDestinations.length > 0) {
    dests = ct.topDestinations.map((d) => ({ target: d.page, count: d.count }));
  } else {
    const agg = new Map();
    for (const { landings } of perPage.values()) {
      for (const [t, c] of landings) agg.set(t, (agg.get(t) ?? 0) + c);
    }
    dests = [...agg.entries()].map(([target, count]) => ({ target, count }));
  }
  const destSum = dests.reduce((a, d) => a + d.count, 0) || 1;
  for (const [page, b] of perPage) {
    const share = b.count / patTotal;
    const total = ct
      ? Math.max(1, Math.round(ct.clicks * share * jitter(0.9, 1.1)))
      : Math.max(1, Math.round(b.count * (pageFactor.get(page) ?? 1) * jitter(0.9, 1.1)));
    const users = ct
      ? Math.round(total * (ct.uniqueUsers / ct.clicks) * jitter(0.9, 1.1))
      : Math.round(total * jitter(0.5, 0.75));
    const key = addButton(page, label, total, users);
    for (const d of dests) {
      const c = Math.max(1, Math.round(d.count * share * (ct ? jitter(0.9, 1.1) : (total / (b.count * ((pageFactor.get(page) ?? 1)))))));
      outEdges.push({ source: page, sourceHandle: `btn:${key}`, kind: 'btn', target: d.target, count: c, users: Math.round(c * jitter(0.5, 0.75)) });
    }
    void destSum;
  }
}

// 3b. 导师卡片（列表页）：ctas 总量 4860，按 pattern 标签占比分给 8 真人，余量给长尾
const card = ctasByLabel.get('导师卡片（列表页）');
const cardKey = addButton('/mentors', card.label, card.clicks, card.uniqueUsers);
const patCardSum = [...mentorCards.values()].reduce((a, b) => a + b, 0) || 1;
const KNOWN_SHARE = 0.9; // 真人导师分 90%，长尾分 10%
let knownCardSum = 0;
const knownCard = knownSlugs.map((s) => {
  const c = Math.max(5, Math.round(card.clicks * KNOWN_SHARE * ((mentorCards.get(s) ?? 0) / patCardSum) * jitter(0.9, 1.1)));
  knownCardSum += c;
  return c;
});
const tailCardTarget = Math.max(TAIL_COUNT, card.clicks - knownCardSum);
const tailCardRaw = Array.from({ length: TAIL_COUNT }, () => rint(8, 37));
const tailCardSum = tailCardRaw.reduce((a, b) => a + b, 0);
knownSlugs.forEach((s, i) => {
  outEdges.push({ source: '/mentors', sourceHandle: `btn:${cardKey}`, kind: 'btn', target: `/mentors/${s}`, count: knownCard[i], users: Math.round(knownCard[i] * jitter(0.55, 0.8)) });
});
tailCardRaw.forEach((raw, i) => {
  const c = Math.max(1, Math.round((raw / tailCardSum) * tailCardTarget));
  outEdges.push({ source: '/mentors', sourceHandle: `btn:${cardKey}`, kind: 'btn', target: `/mentors/x${String(i + 1).padStart(2, '0')}`, count: c, users: Math.round(c * jitter(0.5, 0.75)) });
});

// 3c. 长尾导师页的按钮：开始对话 → /chat、订阅按钮 → /payment
for (let i = 0; i < TAIL_COUNT; i++) {
  const id = `/mentors/x${String(i + 1).padStart(2, '0')}`;
  const chat = Math.round(tailPV[i] * jitter(0.16, 0.26));
  const sub = Math.max(1, Math.round(tailPV[i] * jitter(0.03, 0.06)));
  const ck = addButton(id, '开始对话', chat, Math.round(chat * jitter(0.6, 0.85)));
  const sk = addButton(id, '订阅按钮', sub, Math.round(sub * jitter(0.6, 0.85)));
  outEdges.push({ source: id, sourceHandle: `btn:${ck}`, kind: 'btn', target: '/chat', count: chat, users: Math.round(chat * jitter(0.6, 0.85)) });
  outEdges.push({ source: id, sourceHandle: `btn:${sk}`, kind: 'btn', target: '/payment', count: sub, users: Math.round(sub * jitter(0.5, 0.8)) });
}

// 3d. 页面直连边（pattern 结构 × 页面系数）
for (const [k, count] of patEdge) {
  const [src, tgt] = k.split('|');
  if (MENTOR_RE.test(src) && !knownSlugs.includes(src.match(MENTOR_RE)[1])) continue; // 长尾页无 pattern 结构
  const F = pageFactor.get(src) ?? 1;
  const c = Math.max(1, Math.round(count * F * jitter(0.9, 1.1)));
  outEdges.push({ source: src, sourceHandle: 'page:out', kind: 'page', target: tgt, count: c, users: Math.round(c * jitter(0.5, 0.75)) });
}

// ---------- 4. 校验 ----------
const pvSum = outPages.reduce((a, p) => a + p.pv, 0);
const cardSum = outEdges.filter((e) => e.sourceHandle === `btn:${cardKey}`).reduce((a, e) => a + e.count, 0);
console.log(`页面 ${outPages.length} 个（真人导师 ${knownSlugs.length} + 长尾 ${TAIL_COUNT}），PV 合计 ${pvSum.toLocaleString()}（页面 tab 合计 ${pages.pages.reduce((a, p) => a + p.views, 0).toLocaleString()}）`);
console.log(`按钮 ${outButtons.length} 个，边 ${outEdges.length} 条`);
console.log(`导师卡片点击合计 ${cardSum}（ctas 锚定 ${card.clicks}）`);
if (Math.abs(cardSum - card.clicks) / card.clicks > 0.2) console.warn('⚠ 导师卡片点击与 ctas 偏差超过 20%');
for (const [label] of patBtn) {
  const ct = ctasByLabel.get(label);
  if (!ct) continue;
  const sum = outEdges.filter((e) => e.label === label).reduce((a, e) => a + e.count, 0);
  const byBtn = outButtons.filter((b) => b.label === label).reduce((a, b) => a + b.clicks, 0);
  if (Math.abs(byBtn - ct.clicks) / ct.clicks > 0.25) console.warn(`⚠ 按钮「${label}」分摊合计 ${byBtn} 与锚定 ${ct.clicks} 偏差超过 25%`);
  void sum;
}

// ---------- 5. 输出 ----------
const out = {
  dateRange: pages.dateRange,
  note: '以 32 位抽样用户的事件流为跳转结构骨架，按「页面」「按钮」两个 tab 的总量锚定放大合成；页面数值与页面 tab 一致，按钮点击与按钮 tab 一致，连线为站内跳转估计。',
  pages: outPages,
  buttons: outButtons,
  edges: outEdges,
};
writeFileSync('public/demo/admin/journey-graph.json', JSON.stringify(out, null, 1) + '\n');
console.log('已写入 public/demo/admin/journey-graph.json');
