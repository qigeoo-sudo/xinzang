/**
 * 知识卡匹配 tab 的 demo 数据生成器 → 写入 public/demo/admin/mentors.json 的 knowledgeMatch 段
 *
 * - 8 位真实导师：majorHits/careerHits/riasecHits 取自匹配依据 JSON（≥80 分项）；
 *   topCards 由 DeepSeek 从真实知识卡中按高分领域选 3 张（demo 推断，代替真实问答命中日志）；
 *   topThemes 由 DeepSeek 基于卡内容推断 3 个高频提问主题（demo 推断）。
 * - 12 位 mock 导师：全部按 id 播种确定性虚拟。
 *
 * 运行：node scripts/gen-knowledge-match-demo.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const MENTORS_JSON = resolve(ROOT, 'public/demo/admin/mentors.json');
const MATCH_JSON = 'C:/Users/bingw/Downloads/导师x职业3to1_匹配依据.json';
const CARDS_DIR = resolve(ROOT, 'content/knowledge-governance/cards');
const KEVIN_CARDS = 'D:/database/mentors/kevin yuan/work/kevin-v0.2-interview-ready/prerequisites/kevin_r1_cards_v0.2.jsonl';

for (const f of ['.env', '.env.local']) {
  const p = resolve(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
const API_URL = (process.env.AI_API_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || 'deepseek-chat';
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

const MAJORS = ['计算机与信息技术','工程','数据与量化','会计','医学与健康','金融','商科与管理','法律','应急与公共安全','社会科学与公共管理','教育与社会服务','畜牧兽医与水产','体育学','自然科学','人文与创意','农林','食品'];
const CAREERS = ['会计与审计','人工智能','银行与金融','职业发展与面试技巧','咨询与战略','客户成功与客户管理','数据与分析','设计与用户体验','教育','工程','创业','政府与公共服务','医疗健康','人力资源与招聘','保险','法律','生命科学','市场营销','军队与军工','产品管理','项目管理','房地产','零售与消费品','销售','网络安全','软件工程与 IT','供应链与物流'];
const RIASEC = ['R 实用型','I 研究型','A 艺术型','S 社会型','E 企业型','C 常规型'];

const REAL_FILES = {
  lydiachen: `${CARDS_DIR}/lydiachen_knowledge_cards.jsonl`,
  winnieni: `${CARDS_DIR}/winnieni_knowledge_cards.jsonl`,
  tinazhang: `${CARDS_DIR}/tinazhang_knowledge_cards.jsonl`,
  yingwang: `${CARDS_DIR}/yingwang_knowledge_cards.jsonl`,
  freyagao: `${CARDS_DIR}/freyagao_knowledge_cards.jsonl`,
  phyllischi: `${CARDS_DIR}/phyllischi_knowledge_cards.jsonl`,
  freyaren: `${CARDS_DIR}/freyaren_knowledge_cards.jsonl`,
  kevinyuan: KEVIN_CARDS,
};

const loadCards = (f) => readFileSync(f, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean).map(JSON.parse);

// ---------- DeepSeek：选 3 张高命中卡 + 3 个提问主题 ----------
const SYSTEM = `你是职业辅导知识运营专家。给定一位真人导师的高分匹配领域和其全部知识卡，完成两件事：
1. topCards：从知识卡中选出最能支撑这些高分领域、真实用户最可能高频命中的 3 张卡，按命中可能性从高到低排序，只返回卡片的 cardId；
2. topThemes：基于全部卡内容，推断用户向该导师提问最多的 3 个问题主题，每个是 12-18 字的具体中文短语（不要空泛词，要像真实用户问法，如"工作三年遇到晋升瓶颈怎么办"），按提问频率排序。
只输出 JSON：{"topCards":["cardId1","cardId2","cardId3"],"topThemes":["主题1","主题2","主题3"]}，两个数组都必须恰好 3 项，topCards 必须来自给定卡片。`;

async function pickForMentor(mentorName, hits, cards, attempt = 1) {
  const hitBlock = [
    ...hits.majorHits.map((h) => `专业·${h.name}(${h.score})`),
    ...hits.careerHits.map((h) => `职业·${h.name}(${h.score})`),
    ...hits.riasecHits.map((h) => `兴趣·${h.name}(${h.score})`),
  ].join('、') || '无（各维度均低于80）';
  const cardBlock = cards.map((c) => `${c.cardId}|${c.domain}|${c.title}|${(c.coreView || '').slice(0, 60)}`).join('\n');
  try {
    const res = await fetch(`${API_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `导师：${mentorName}\n高分匹配：${hitBlock}\n知识卡：\n${cardBlock}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = JSON.parse((await res.json()).choices[0].message.content);
    const ids = out.topCards.map(String);
    const themes = out.topThemes.map((t) => String(t).slice(0, 30));
    const valid = ids.filter((id) => cards.some((c) => c.cardId === id));
    if (valid.length !== 3 || themes.length !== 3) throw new Error(`返回不合规 ids=${ids.join('/')} 合法${valid.length} themes=${themes.length}`);
    return { ids: [...new Set(ids)].slice(0, 3), themes };
  } catch (e) {
    if (attempt >= 3) throw e;
    console.warn(`  重试 ${mentorName}: ${String(e.message).slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    return pickForMentor(mentorName, hits, cards, attempt + 1);
  }
}

// ---------- mock 导师虚拟数据（确定性） ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => { let h = 0; for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return h; };
const pickN = (rnd, arr, n) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};
const SCORE = (rnd) => 80 + Math.floor(rnd() * 17); // 80-96

const TITLE_TPL = ['{0}中的优先级排序方法', '{0}场景的避坑清单', '从0到1建立{0}核心能力', '{0}关键决策框架', '{0}高频沟通话术', '{0}新手最常踩的三个误区', '用结构化思维拆解{0}问题', '{0}中的资源整合思路'];
const CORE_TPL = [
  '核心是先界定问题边界，再按影响与成本排序行动，避免在低价值环节平均用力。',
  '资深从业者与新手的差异，在于把隐性经验显性化，用可复用的框架替代临场发挥。',
  '先对齐相关方预期再推进，多数问题源于角色、目标与评价标准没有提前澄清。',
  '把大目标切成两周内可验证的小步，用真实反馈持续修正方向，比一次性规划更可靠。',
  '关键不是信息不够，而是缺少取舍标准；先明确不可妥协项，剩余空间自然清晰。',
];
const APPLY_TPL = [
  '适合有1-3年相关经验、正在处理具体瓶颈的用户。',
  '适合面临方向性选择、需要判断框架的用户。',
  '适合跨领域迁移、需要快速补齐行业认知的用户。',
  '适合刚进入该领域、希望少走弯路的用户。',
  '适合带小团队、需要把个人经验沉淀为方法的用户。',
];
const THEME_TPL = [
  '想转行做{0}但没有相关经历', '{0}岗位面试会被重点问什么', '做{0}两三年看不到成长路径',
  '{0}和当前方向之间怎么取舍', '进入{0}领域需要补哪些能力', '{0}工作强度与真实回报',
  '小城市有没有{0}相关机会', '{0}岗位35岁以后怎么发展',
];

function mockMatch(mentorId) {
  const rnd = mulberry32(seedOf(mentorId + ':km'));
  const top3 = (pool) => {
    const picked = pickN(rnd, pool, 3);
    // 前三按分数降序；第1名 55-96，逐项递减 4-14 分（可能全部低于 80，反映弱匹配导师）
    let score = 55 + Math.floor(rnd() * 42);
    const out = picked.map((name) => {
      const item = { name, score };
      score = Math.max(12, score - (4 + Math.floor(rnd() * 11)));
      return item;
    });
    return out.sort((a, b) => b.score - a.score);
  };
  const majorTop3 = top3(MAJORS);
  const riasecTop3 = top3(RIASEC);
  // 职业方向保持 ≥80% 命中（1-3 个）
  const careerHits = pickN(rnd, CAREERS, 1 + Math.floor(rnd() * 3)).map((name) => ({ name, score: SCORE(rnd) }))
    .sort((a, b) => b.score - a.score);
  const prefix = mentorId.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  const domains = careerHits.length ? careerHits.map((h) => h.name) : ['职业发展'];
  const usedTitle = new Set();
  const topCards = Array.from({ length: 3 }, (_, i) => {
    const domain = domains[i % domains.length];
    let tpl;
    do { tpl = TITLE_TPL[Math.floor(rnd() * TITLE_TPL.length)]; } while (usedTitle.has(tpl) && usedTitle.size < TITLE_TPL.length);
    usedTitle.add(tpl);
    return {
      cardId: `${prefix}-DEMO-00${i + 1}`,
      domain,
      title: tpl.replace('{0}', domain),
      coreView: CORE_TPL[Math.floor(rnd() * CORE_TPL.length)],
      applicableTo: APPLY_TPL[Math.floor(rnd() * APPLY_TPL.length)],
      demoInferred: true,
    };
  });
  const usedTheme = new Set();
  const topThemes = [];
  while (topThemes.length < 3) {
    const t = THEME_TPL[Math.floor(rnd() * THEME_TPL.length)].replace('{0}', domains[Math.floor(rnd() * domains.length)]);
    if (!usedTheme.has(t)) { usedTheme.add(t); topThemes.push(t); }
  }
  return { majorTop3, careerHits, riasecTop3, topCards, topThemes, demoInferred: true };
}

/** 从全量匹配分中取前三（按分数降序） */
const top3Of = (group) => [...group].sort((a, b) => b.score - a.score).slice(0, 3).map((x) => ({ name: x.item, score: x.score }));

// ---------- main ----------
(async () => {
  const fresh = process.argv.includes('--fresh');
  if (fresh && !API_KEY) throw new Error('--fresh 需要 DEEPSEEK_API_KEY / OPENAI_API_KEY');
  const data = JSON.parse(readFileSync(MENTORS_JSON, 'utf-8'));
  const match = JSON.parse(readFileSync(MATCH_JSON, 'utf-8'));
  const matchByName = new Map(match.map((m) => [m.name, m]));

  const tasks = data.mentors.map((m) => async () => {
    if (REAL_FILES[m.id]) {
      const mm = matchByName.get(m.name);
      if (!mm) throw new Error(`匹配依据中找不到 ${m.name}`);
      // 专业/兴趣取匹配度前三（不受 80 门槛限制）；职业方向保持仅 ≥80%
      const groups = {
        majorTop3: top3Of(mm.groups.majors),
        riasecTop3: top3Of(mm.groups.riasec),
        careerHits: mm.groups.careers.filter((x) => x.score >= 80).map((x) => ({ name: x.item, score: x.score })),
      };
      // 默认复用上次 AI 推断的命中卡/提问主题；--fresh 才重新调用
      const prev = m.knowledgeMatch;
      if (!fresh && prev?.topCards?.length === 3 && prev?.topThemes?.length === 3) {
        m.knowledgeMatch = { ...groups, topCards: prev.topCards, topThemes: prev.topThemes, demoInferred: true };
        console.log(`✓ 真实 ${m.name}（复用卡/主题）: 专业${groups.majorTop3.map((h) => h.score).join('/')} 职业≥80 ${groups.careerHits.length} 兴趣${groups.riasecTop3.map((h) => h.score).join('/')}`);
        return;
      }
      const cards = loadCards(REAL_FILES[m.id]);
      const picked = await pickForMentor(m.name, {
        majorHits: groups.majorTop3.filter((h) => h.score >= 80),
        careerHits: groups.careerHits,
        riasecHits: groups.riasecTop3.filter((h) => h.score >= 80),
      }, cards);
      const byId = new Map(cards.map((c) => [c.cardId, c]));
      const topCards = picked.ids.map((id) => {
        const c = byId.get(id);
        return {
          cardId: c.cardId, domain: c.domain, title: c.title,
          coreView: c.coreView || '', applicableTo: c.applicableTo || '',
          demoInferred: true,
        };
      });
      m.knowledgeMatch = { ...groups, topCards, topThemes: picked.themes, demoInferred: true };
      console.log(`✓ 真实 ${m.name}（AI 重新推断）卡[${picked.ids.join(',')}]`);
    } else {
      m.knowledgeMatch = mockMatch(m.id);
      console.log(`✓ mock ${m.name}`);
    }
  });

  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < tasks.length) { const i = next++; await tasks[i](); }
  }));

  // 校验：Top3 两列恰好 3 项且降序、分数 0-100；职业命中全部 ≥80
  for (const m of data.mentors) {
    const km = m.knowledgeMatch;
    for (const g of ['majorTop3', 'riasecTop3']) {
      if (km[g].length !== 3) throw new Error(`${m.name} ${g} 不是 3 项`);
      km[g].forEach((h) => { if (h.score < 0 || h.score > 100) throw new Error(`${m.name} ${g} 分数越界 ${h.score}`); });
      for (let i = 1; i < 3; i++) if (km[g][i].score > km[g][i - 1].score) throw new Error(`${m.name} ${g} 未降序`);
    }
    for (const h of km.careerHits) if (h.score < 80 || h.score > 100) throw new Error(`${m.name} careerHits 低于 80 ${h.score}`);
    if (km.topCards.length !== 3 || km.topThemes.length !== 3) throw new Error(`${m.name} Top3 数量异常`);
  }
  writeFileSync(MENTORS_JSON, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`\n已写入 ${MENTORS_JSON}（${data.mentors.length} 位导师的 knowledgeMatch）`);
})().catch((e) => { console.error('失败:', e); process.exit(1); });
