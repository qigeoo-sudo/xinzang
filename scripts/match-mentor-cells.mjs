/**
 * 导师能力 × 专业/职业/RIASEC 单元格匹配度打分
 * 数据源：7 位导师规范知识卡 + Kevin v0.2（未入规范集）；Echo/Minnie 无卡留空
 * 打分：DeepSeek（温度0，统一锚点，逐格依据）；结果落审计 JSON 后填充 Excel
 * 用法：node scripts/match-mentor-cells.mjs            # 打分 + 填表
 *       node scripts/match-mentor-cells.mjs --fill     # 只用已有审计 JSON 填表
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

const ROOT = process.cwd();
const CARDS_DIR = resolve(ROOT, 'content/knowledge-governance/cards');
const KEVIN_CARDS = 'D:/database/mentors/kevin yuan/work/kevin-v0.2-interview-ready/prerequisites/kevin_r1_cards_v0.2.jsonl';
const SRC_XLSX = 'C:/Users/bingw/Downloads/导师x职业3to1空表.xlsx';
const OUT_XLSX = 'C:/Users/bingw/Downloads/导师x职业3to1_匹配度.xlsx';
const AUDIT_JSON = 'C:/Users/bingw/Downloads/导师x职业3to1_匹配依据.json';

// ---------- env ----------
for (const f of ['.env', '.env.local']) {
  const p = resolve(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v;
  }
}
const API_URL = (process.env.AI_API_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || 'deepseek-chat';
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

// ---------- 维度定义 ----------
const MAJORS = [
  ['计算机与信息技术', '计算机、软件工程、人工智能、信息安全、数据科学、网络空间安全、信息与计算科学'],
  ['工程', '电气、机械、通信、微电子、新能源、汽车、土木、化工材料、航空船舶、环境、建筑、智能制造、机器人、低空安全'],
  ['数据与量化', '数学、统计学、应用数学、经济统计学、金融数学、金融工程、精算学'],
  ['会计', '会计学、财务管理、审计学、税务、资产评估'],
  ['医学与健康', '临床、口腔、护理、药学、预防、公卫、医学技术、营养、康复、整形美容'],
  ['金融', '金融学、保险学、投资学、金融科技、国贸'],
  ['商科与管理', '工商管理、市场营销、人力资源、物流/供应链、电子商务、国际商务、运营管理、销售管理、大数据管理与应用、旅游/酒店/会展'],
  ['法律', '法学、知识产权、国际法、纪检监察、司法警务'],
  ['应急与公共安全', '消防工程、火灾勘查、抢险救援、核生化消防、应急管理、安全工程、警务技术'],
  ['社会科学与公共管理', '公共管理、政策研究、社会学、政治学、图书情报'],
  ['教育与社会服务', '教育学、学前、特教、小教、心理、社工'],
  ['畜牧兽医与水产', '宠物医疗、动物医学、畜牧兽医、动物科学、动物药学、动物检疫、水产养殖、水生动物医学、海洋渔业'],
  ['体育学', '体育教育、运动训练、武术、传统体育、休闲体育、电子竞技运动与管理'],
  ['自然科学', '物理、化学、生物、地理、大气、海洋、地质、生态'],
  ['人文与创意', '汉语言、新闻传播、广告、外语、艺术、设计、历史、哲学'],
  ['农林', '农学、园艺、植保、茶学、林学、森林保护、园林、烟草、水土保持、草业、野生动物保护'],
  ['食品', '食品科学与工程、食品质量与安全、酿酒、葡萄酒、香料香精'],
];
const CAREERS = [
  '会计与审计', '人工智能', '银行与金融', '职业发展与面试技巧', '咨询与战略',
  '客户成功与客户管理', '数据与分析', '设计与用户体验', '教育', '工程',
  '创业', '政府与公共服务', '医疗健康', '人力资源与招聘', '保险',
  '法律', '生命科学', '市场营销', '军队与军工', '产品管理',
  '项目管理', '房地产', '零售与消费品', '销售', '网络安全',
  '软件工程与 IT', '供应链与物流',
];
const RIASEC = [
  ['R 实用型', '动手操作解决实际问题、偏好现场工作；如机械工程师、飞行员、宠物医生'],
  ['I 研究型', '逻辑推导与实验验证、深度思考；如算法工程师、数据分析师、生化研究员'],
  ['A 艺术型', '独特表达、打破框架原创输出；如建筑设计师、UX设计师、广告策划'],
  ['S 社会型', '关注他人需求、沟通建立信任提供支持；如人力资源管理、培训师、职业顾问'],
  ['E 企业型', '识别机会调动资源、说服与决策；如咨询顾问、投资经理、创业者'],
  ['C 常规型', '对秩序与准确性敏感、规则内高效处理流程；如审计师、财务分析师、合规专员'],
];

const MENTORS = [
  { id: 'lydiachen', name: 'Lydia Chen', file: `${CARDS_DIR}/lydiachen_knowledge_cards.jsonl` },
  { id: 'winnieni', name: 'Winnie Ni', file: `${CARDS_DIR}/winnieni_knowledge_cards.jsonl` },
  { id: 'tinazhang', name: 'Tina Zhang', file: `${CARDS_DIR}/tinazhang_knowledge_cards.jsonl` },
  { id: 'yingwang', name: 'Ying Wang', file: `${CARDS_DIR}/yingwang_knowledge_cards.jsonl` },
  { id: 'freyagao', name: 'Freya Gao', file: `${CARDS_DIR}/freyagao_knowledge_cards.jsonl` },
  { id: 'phyllischi', name: 'Phyllis Chi', file: `${CARDS_DIR}/phyllischi_knowledge_cards.jsonl` },
  { id: 'freyaren', name: 'Freya Ren', file: `${CARDS_DIR}/freyaren_knowledge_cards.jsonl` },
  { id: 'kevin', name: 'Kevin Yuan', file: KEVIN_CARDS },
];

// ---------- 读卡 ----------
function loadCards(file) {
  return readFileSync(file, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => JSON.parse(l));
}
function digest(cards) {
  return cards.map((c, i) => {
    let s = `${i + 1}. [${c.domain}] ${c.title}。核心观点：${c.coreView || ''}`;
    if (c.applicableTo) s += ` 适用：${c.applicableTo}`;
    return s.length > 320 ? s.slice(0, 320) + '…' : s;
  }).join('\n');
}

// ---------- 打分 ----------
const SYSTEM = `你是"AI职业辅导导师能力匹配度"评估器。
给定一位真人职业导师沉淀的知识卡（领域/标题/核心观点/适用场景），以及一组待评估维度，逐维评估匹配度。
匹配度定义：持有该维度典型背景/目标的用户带着典型困惑向这位导师求助时，导师的知识卡能够提供有效帮助的程度。
打分锚点（整数0-100）：
95-100 该维度是导师核心专长，知识卡近乎全面覆盖，可直接深度指导；
80-94 强相关，有丰富的一手经验与方法论，能解决大部分典型问题；
40-79 中等相关，有可观的可迁移经验或相邻领域内容，能提供有价值的帮助但非专长；
20-39 弱相关，仅有少量可迁移内容（通用职业能力也算）；
5-19 仅沾边，知识卡几乎不直接覆盖；
0-4 基本无关。
要求：严格依据知识卡内容打分，禁止脑补导师履历中未出现在卡片里的能力；通用的简历/面试/职业规划类卡片对任何职业维度可有 12-35 的基础相关度，不要给所有维度打高分。
粒度要求：必须精确到 1%，使用 0-100 的任意整数，严禁习惯性取 5 或 10 的倍数；即使相关度接近，不同维度也要依据证据强度给出 1-9 分的细微差异（例如 47 和 52，而不是都给 50）。
只输出 JSON：{"items":[{"score":整数,"reason":"20字内中文依据"}]}。
禁止在结果中输出维度名；items 的数量与顺序必须与给定维度逐一对应（第1个结果对应第1个维度，以此类推）。`;

async function callScore(mentorName, cardsText, dims) {
  const dimBlock = dims.map((d, i) => {
    const [name, hint] = Array.isArray(d) ? d : [d];
    return `${i + 1}. ${name}${hint ? `（涵盖：${hint}）` : ''}`;
  }).join('\n');
  const userMsg = `导师：${mentorName}\n知识卡：\n${cardsText}\n\n待评估维度（${dims.length}个，item 必须原样使用这些名称）：\n${dimBlock}`;
  const body = {
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userMsg },
    ],
  };
  const res = await fetch(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.items;
}

async function scoreWithRetry(mentorName, cardsText, dims, attempt = 1) {
  let items;
  try {
    items = await callScore(mentorName, cardsText, dims);
    const expected = dims.map((d) => (Array.isArray(d) ? d[0] : d));
    const bad = items.filter((x) => !Number.isInteger(x.score) || x.score < 0 || x.score > 100);
    if (bad.length || items.length !== dims.length) {
      throw new Error(`数量${items.length}/${dims.length} 越界${bad.length} 样例${JSON.stringify(items[0]).slice(0, 120)}`);
    }
    // 按顺序对齐，模型不需要回传维度名
    return expected.map((n, i) => ({ item: n, score: items[i].score, reason: String(items[i].reason || '').slice(0, 40) }));
  } catch (e) {
    if (attempt >= 3) throw e;
    console.warn(`  重试 ${mentorName} (${String(e.message).slice(0, 160)})，第${attempt + 1}次`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    return scoreWithRetry(mentorName, cardsText, dims, attempt + 1);
  }
}

async function runPool(tasks, limit = 4) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
      console.log(`  ✓ ${results[i].label}`);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- 填 Excel ----------
const FILLS = {
  red: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } },
  orange: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6600' } },
  gray: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEECE1' } },
  light: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } },
  white: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
};
function fillFor(s) {
  if (s >= 95) return FILLS.red;
  if (s >= 80) return FILLS.orange;
  if (s >= 20) return FILLS.gray;
  if (s >= 5) return FILLS.light;
  return FILLS.white;
}

const RIASEC_KEY = { R: 'R 实用型', I: 'I 研究型', A: 'A 艺术型', S: 'S 社会型', E: 'E 企业型', C: 'C 常规型' };

async function fillExcel(scores) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC_XLSX);

  const applySheet = (sheetName, groupKey, headerMap) => {
    const ws = wb.getWorksheet(sheetName);
    // 列号：按表头匹配
    const colOf = new Map();
    const hdr = ws.getRow(1);
    hdr.eachCell((cell, col) => {
      if (col === 1) return;
      const raw = String(cell.value || '');
      const key = headerMap(raw);
      if (key) colOf.set(key, col);
    });
    for (let r = 2; r <= ws.rowCount; r++) {
      const mentorName = String(ws.getCell(r, 1).value || '').trim();
      const ms = scores.find((x) => x.name === mentorName);
      if (!ms) continue;
      for (const [key, col] of colOf) {
        const hit = ms.groups[groupKey].find((x) => x.item === key);
        if (!hit) continue;
        const cell = ws.getCell(r, col);
        cell.value = `${hit.score}%`;
        cell.fill = fillFor(hit.score);
        cell.font = { color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }
  };

  applySheet('导师专业分类', 'majors', (raw) => MAJORS.some(([n]) => raw === n) ? raw : null);
  applySheet('导师职业方向', 'careers', (raw) => CAREERS.includes(raw) ? raw : null);
  applySheet('导师RIASEC', 'riasec', (raw) => {
    const letter = String(raw).trim().charAt(0).toUpperCase();
    return RIASEC_KEY[letter] || null;
  });

  await wb.xlsx.writeFile(OUT_XLSX);
  console.log('Excel 已写出:', OUT_XLSX);
}

// ---------- main ----------
(async () => {
  if (process.argv.includes('--fill')) {
    const scores = JSON.parse(readFileSync(AUDIT_JSON, 'utf-8'));
    await fillExcel(scores);
    return;
  }
  if (!API_KEY) throw new Error('缺少 DEEPSEEK_API_KEY / OPENAI_API_KEY');

  const tasks = [];
  for (const m of MENTORS) {
    const cards = loadCards(m.file);
    const text = digest(cards);
    const groups = {};
    for (const [gk, dims] of [['majors', MAJORS], ['careers', CAREERS.map((c) => [c])], ['riasec', RIASEC]]) {
      tasks.push({
        label: `${m.name} · ${gk}`,
        run: async () => { groups[gk] = await scoreWithRetry(m.name, text, dims); },
      });
    }
    m._groups = groups;
  }
  // 并发池：任务闭包写回各自 mentor 对象
  let idx = 0;
  const all = tasks;
  const limit = 4;
  const workers = Array.from({ length: limit }, async () => {
    while (idx < all.length) {
      const i = idx++;
      await all[i].run();
      console.log(`✓ [${i + 1}/${all.length}] ${all[i].label}`);
    }
  });
  await Promise.all(workers);

  const scores = MENTORS.map((m) => ({
    id: m.id, name: m.name, cardSource: m.file, cardCount: loadCards(m.file).length,
    groups: m._groups,
  }));
  writeFileSync(AUDIT_JSON, JSON.stringify(scores, null, 2), 'utf-8');
  console.log('审计依据已写出:', AUDIT_JSON);

  // 完整性校验
  let cells = 0;
  for (const s of scores) for (const gk of ['majors', 'careers', 'riasec']) cells += s.groups[gk].length;
  if (cells !== 8 * (17 + 27 + 6)) throw new Error(`格子数异常 ${cells}`);
  console.log(`完整性 OK：${cells} 格`);

  await fillExcel(scores);
})().catch((e) => { console.error('失败:', e); process.exit(1); });
