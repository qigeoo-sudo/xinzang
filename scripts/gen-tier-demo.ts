/**
 * 一次性 demo 生成器：用 SABC 评分引擎重算 public/demo/admin/mentors.json 的
 * revenueYuan（订阅确认收入口径）与 tier（S/A/B/C 分档）。
 *
 * 模拟流水（确定性随机，按 mentor id 播种，可重复）：
 * - 订阅卡：每位订阅者从周期开始前 0-30 天起持续购卡（月/季/年 72/22/6），
 *   到期后 0-5 天续下一张；3% 模拟归因失败（mentorId=null，进「其他」池）。
 * - 加榨包：按 helpedUsers 每用户 2.5-4 轮消耗，撒在周期内随机日期（只计消耗）。
 *
 * 校验：新分档必须与旧 tier 完全一致（规模与 subscribers 单调，组间间距足够），
 * 且分布为 1/3/6/10，否则抛错（调权重而非静默改档）。
 *
 * 运行：npx tsx scripts/gen-tier-demo.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { scoreMentors, assignTiers, attributePaymentMentor, type AttributedCard, type CreditPackUse, type PlanKind } from '../src/lib/tier-score';

const PATH = 'public/demo/admin/mentors.json';
const data = JSON.parse(readFileSync(PATH, 'utf8')) as {
  dateRange: { start: string; end: string };
  mentors: Array<{
    id: string; tier: string; subscribers: number;
    dialogue: { helpedUsers: number };
    [k: string]: unknown;
  }>;
};

const PERIOD = { start: data.dateRange.start, end: data.dateRange.end };

const PLANS: Array<{ kind: PlanKind; days: number; price: number; weight: number }> = [
  { kind: 'MONTHLY', days: 30, price: 29.9, weight: 0.72 },
  { kind: 'QUARTERLY', days: 90, price: 79.9, weight: 0.22 },
  { kind: 'YEARLY', days: 365, price: 269.9, weight: 0.06 },
];
const OTHER_RATE = 0.03;

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s: string) => { let h = 0; for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return h; };
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
const periodDays = daysBetween(PERIOD.start, PERIOD.end) + 1;

const allCards: AttributedCard[] = [];
const allUses: CreditPackUse[] = [];
let otherCards = 0;
let channelHit = 0;
let behaviorHit = 0;

for (const m of data.mentors) {
  const rnd = mulberry32(seedOf(m.id));
  const pickPlan = () => {
    const r = rnd();
    let acc = 0;
    for (const p of PLANS) { acc += p.weight; if (r <= acc) return p; }
    return PLANS[0];
  };

  // 订阅卡流水：每个订阅者一条持续购卡链；归因走引擎五级链路：
  // 3% 渠道/行为全部不一致归其他，35% 渠道来自导师直接命中（第 0 级），62% 付费前后行为一致（第 1 级）
  for (let u = 0; u < m.subscribers; u++) {
    const roll = rnd();
    const mentorId =
      roll < OTHER_RATE
        ? attributePaymentMentor({ channelMentorId: null, chatsBefore: [{ mentorId: 'x', ts: 1 }], firstChatAfterMentor: 'y' })
        : roll < OTHER_RATE + 0.35
          ? (channelHit++, attributePaymentMentor({ channelMentorId: m.id, chatsBefore: [{ mentorId: 'x', ts: 1 }], firstChatAfterMentor: 'x' }))
          : (behaviorHit++, attributePaymentMentor({ channelMentorId: null, chatsBefore: [{ mentorId: m.id, ts: 1 }], firstChatAfterMentor: m.id }));
    if (mentorId === null) otherCards++;

    let cursor = addDays(PERIOD.start, -Math.floor(rnd() * 30));
    // 安全上限：一条链最多 12 张（年卡 1 张即结束）
    for (let guard = 0; guard < 12 && cursor < PERIOD.end; guard++) {
      const plan = pickPlan();
      allCards.push({ plan: plan.kind, paidAmount: plan.price, startDate: cursor, endDate: addDays(cursor, plan.days), mentorId });
      cursor = addDays(cursor, plan.days + Math.floor(rnd() * 6));
    }
  }

  // 加榨包消耗：每帮助用户 2.5-4 轮，随机撒到周期内
  const totalRounds = Math.round(m.dialogue.helpedUsers * (2.5 + rnd() * 1.5));
  for (let i = 0; i < totalRounds; i++) {
    allUses.push({ date: addDays(PERIOD.start, Math.floor(rnd() * periodDays)), mentorId: m.id, rounds: 1 });
  }
}

const result = scoreMentors(PERIOD, allCards, allUses);
const tiers = assignTiers(result.byMentor);

// 校验 1：分布必须为 1/3/6/10
const dist = { S: 0, A: 0, B: 0, C: 0 } as Record<string, number>;
for (const t of tiers.values()) dist[t]++;
if (dist.S !== 1 || dist.A !== 3 || dist.B !== 6 || dist.C !== 10) {
  throw new Error(`分档分布异常: ${JSON.stringify(dist)}（期望 1/3/6/10），需调整模拟权重`);
}

// 校验 2：每位导师新档必须与旧档一致（规模单调性检查）
for (const m of data.mentors) {
  const got = tiers.get(m.id);
  if (got !== m.tier) {
    throw new Error(`${m.id}: 旧档 ${m.tier} → 新档 ${got}，规模/金额梯度被随机波动打破，需调整模拟权重`);
  }
}

// 订阅人次：周期内 startDate 落在周期内的购卡张数（每张卡=1 人次，含续费），按月/季/年分
const subPlansMap = new Map<string, { monthly: number; quarterly: number; yearly: number }>();
for (const c of allCards) {
  if (c.mentorId === null || c.startDate < PERIOD.start || c.startDate > PERIOD.end) continue;
  const cur = subPlansMap.get(c.mentorId) ?? { monthly: 0, quarterly: 0, yearly: 0 };
  if (c.plan === 'MONTHLY') cur.monthly++;
  else if (c.plan === 'QUARTERLY') cur.quarterly++;
  else cur.yearly++;
  subPlansMap.set(c.mentorId, cur);
}

// ========== 用户画像 Top3 造数（契约对齐真实 UserProfile / InterestAssessment 字段）==========
type NC = { label: string; count: number };
const MAJOR_POOL = ['计算机科学与技术', '软件工程', '金融学', '市场营销', '电气工程及其自动化', '教育学', '新闻传播学', '机械工程', '临床医学', '视觉传达设计', '法学', '会计学', '心理学', '英语', '土木工程'];
const LOC_POOL = ['广东·深圳', '广东·广州', '广东·顺德', '上海·上海', '北京·北京', '浙江·杭州', '浙江·宁波', '江苏·南京', '江苏·苏州', '四川·成都', '湖北·武汉', '福建·厦门', '湖南·长沙', '陕西·西安'];
const CAREER_POOL = ['软件工程与 IT', '人工智能', '数据与分析', '市场营销', '产品管理', '设计与用户体验', '银行与金融', '咨询与战略', '教育', '人力资源与招聘', '会计与审计', '销售', '政府与公共服务', '创业'];
const ANXIETY_POOL = ['方向不清、选择困难', '简历与面试经验不足', '能力与自信不足', '行业岗位认知不足', '专业不对口', '求职竞争太激烈', '考研还是就业', '薪资与预期有落差', '人脉资源缺乏'];
const HELP_POOL = ['帮我看清自己适合什么', '告诉我行业岗位真实情况', '教我具体求职技巧', '受挫后帮我复盘并给出具体建议'];
const DEEPCHAT_POOL = ['资深 HR', '职业规划师', '行业大咖', '目标单位在职员工', '创业导师', '猎头', '学哥学姐', '心理咨询师'];
const RIASEC_POOL = ['R 实用型', 'I 研究型', 'A 艺术型', 'S 社会型', 'E 企业型', 'C 事务型'];

function shuffled<T>(rnd: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从标签池取 3 个，按 base 的衰减份额给人数（保证严格递减、合计≤base，给饼图留「其他」余量） */
function top3(rnd: () => number, pool: string[], base: number, shift = 0): NC[] {
  const fracs = [0.42, 0.3, 0.22];
  let counts = shuffled(rnd, pool).slice(0, 3).map((label, i) => ({
    label,
    count: Math.max(1, Math.round(base * fracs[i] * (0.85 + rnd() * 0.3) + shift)),
  }));
  // 钳制合计 ≤ 基数（随机波动可能使总和略超），按比例缩减后修平取整误差
  let sum = counts.reduce((s, x) => s + x.count, 0);
  if (sum > base) {
    counts = counts.map((x) => ({ ...x, count: Math.max(1, Math.floor((x.count / sum) * base)) }));
    sum = counts.reduce((s, x) => s + x.count, 0);
    let k = 0;
    while (sum < base - 3 && counts[0].count < base) { counts[k % 3].count++; sum++; k++; }
    while (sum > base) { const j = counts.reduce((mi, x, i) => (x.count < counts[mi].count ? i : mi), 2); counts[j].count--; sum--; }
  }
  return counts.sort((a, b) => b.count - a.count);
}

/** 目前状态：按权重切分 base 为在校/在职/待业，取整补差保证合计=base */
function statusSplit(rnd: () => number, base: number, w: [number, number, number]): NC[] {
  const labels = ['在校', '在职', '待业'];
  const raw = w.map((x) => base * x * (0.9 + rnd() * 0.2));
  let counts = raw.map((x) => Math.round(x));
  let diff = base - counts.reduce((s, x) => s + x, 0);
  let i = 0;
  while (diff !== 0) {
    counts[i % 3] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    i++;
  }
  return labels.map((label, k) => ({ label, count: Math.max(0, counts[k]) }));
}

function buildAudience(seed: number, base: number, tier: 'total' | 'paid' | 'free') {
  const rnd = mulberry32(seed ^ (tier === 'paid' ? 0x51 : tier === 'free' ? 0x9f : 0x33));
  // 付费偏在职/一线/企业事务，免费偏在校/研究艺术
  const sw: [number, number, number] =
    tier === 'paid' ? [0.34, 0.52, 0.14] : tier === 'free' ? [0.5, 0.28, 0.22] : [0.41, 0.38, 0.21];
  // RIASEC 六类各造人数（付费偏 E/C/S，免费偏 I/A/S），排序后取前三
  const rw: Record<string, number> =
    tier === 'paid' ? { R: 0.16, I: 0.18, A: 0.12, S: 0.24, E: 0.3, C: 0.26 }
      : tier === 'free' ? { R: 0.2, I: 0.28, A: 0.24, S: 0.22, E: 0.12, C: 0.1 }
        : { R: 0.18, I: 0.23, A: 0.19, S: 0.23, E: 0.2, C: 0.17 };
  const riasec = RIASEC_POOL.map((label) => {
    const code = label.charAt(0);
    return { label, count: Math.max(1, Math.round(base * rw[code] * (0.85 + rnd() * 0.3))) };
  }).sort((a, b) => b.count - a.count).slice(0, 3);
  return {
    status: statusSplit(rnd, base, sw),
    majors: top3(rnd, MAJOR_POOL, base),
    hopeLocations: top3(rnd, LOC_POOL, base),
    currentLocations: top3(rnd, LOC_POOL, base),
    careers: top3(rnd, CAREER_POOL, base),
    anxieties: top3(rnd, ANXIETY_POOL, base),
    helpWanted: top3(rnd, HELP_POOL, base),
    deepChat: top3(rnd, DEEPCHAT_POOL, base),
    riasec,
  };
}

// 写回
for (const mRaw of data.mentors) {
  const m = mRaw as Record<string, unknown>;
  const rnd = mulberry32(seedOf(mRaw.id) ^ 0x9e3779b9);
  m.revenueYuan = Math.round(result.byMentor.get(mRaw.id) ?? 0);
  m.tier = tiers.get(mRaw.id) as string;

  // 订阅人次（月:季:年）
  m.subPlans = subPlansMap.get(mRaw.id) ?? { monthly: 0, quarterly: 0, yearly: 0 };
  // 引流注册人数：帮助用户的 25%-45%（引流来未必付费，故独立于订阅人数）
  m.referrals = Math.round(mRaw.dialogue.helpedUsers * (0.25 + rnd() * 0.2));
  // 推荐覆盖人数（mentor_card.impression 去重）：帮助用户的 1.8-2.4 倍
  const reach = Math.round(mRaw.dialogue.helpedUsers * (1.8 + rnd() * 0.6));
  // 主页访问人数（mentor_profile.view 去重）：帮助用户的 1.0-1.5 倍，且不超过推荐覆盖
  m.recommendedReach = reach;
  m.profileVisits = Math.min(reach, Math.round(mRaw.dialogue.helpedUsers * (1.0 + rnd() * 0.5)));
  // caseshare 案例提交数：0-12，与知识卡规模弱相关
  m.caseCount = Math.min(12, Math.round(mRaw.knowledgeCards * (0.05 + rnd() * 0.12)));
  // 导师后台登录次数：2-28
  m.loginCount = 2 + Math.floor(rnd() * 27);

  // 对话时长（分钟）：付费每轮 4.2-6.2 分钟，免费每轮 2.8-4.5 分钟
  const dlg = m.dialogue as {
    rounds: number; paid: { rounds: number }; free: { rounds: number };
    durationMin?: number; paid2?: unknown;
  } & { paid: Record<string, unknown>; free: Record<string, unknown> };
  const paidMin = Math.round(dlg.paid.rounds * (4.2 + rnd() * 2));
  const freeMin = Math.round(dlg.free.rounds * (2.8 + rnd() * 1.7));
  dlg.durationMin = paidMin + freeMin;
  dlg.paid.durationMin = paidMin;
  dlg.free.durationMin = freeMin;
  // 顶层旧字段同步为同一口径（页面已不再展示，保留避免数据矛盾）
  m.totalDurationMin = paidMin + freeMin;

  // 用户画像重构：9 组 Top3 × 三口径，基数=各口径帮助人数
  const seed = seedOf(mRaw.id);
  m.audience = {
    ...buildAudience(seed, dlg.helpedUsers, 'total'),
    paid: buildAudience(seed, dlg.paid.helpedUsers, 'paid'),
    free: buildAudience(seed, dlg.free.helpedUsers, 'free'),
  };
}
writeFileSync(PATH, JSON.stringify(data, null, 2) + '\n');

// 自检：付费+免费时长=总时长；漏斗 推荐覆盖≥主页访问
for (const m of data.mentors) {
  const d = m.dialogue as unknown as { durationMin: number; paid: { durationMin: number }; free: { durationMin: number } };
  if (d.paid.durationMin + d.free.durationMin !== d.durationMin) throw new Error(`${m.id} 时长不自洽`);
  const x = m as unknown as { recommendedReach: number; profileVisits: number };
  if (x.recommendedReach < x.profileVisits) throw new Error(`${m.id} 漏斗不自洽：推荐覆盖 < 主页访问`);
  // 画像校验：状态合计=帮助人数；各 Top3 三项、严格递减、不超基数
  const aud = m.audience as unknown as Record<string, { label: string; count: number }[]>;
  const dlg2 = m.dialogue as unknown as { helpedUsers: number; paid: { helpedUsers: number }; free: { helpedUsers: number } };
  const bases: [string, number][] = [['', dlg2.helpedUsers], ['paid', dlg2.paid.helpedUsers], ['free', dlg2.free.helpedUsers]];
  for (const [pfx, baseN] of bases) {
    const a = pfx ? (aud as unknown as Record<string, typeof aud>)[pfx] : aud;
    const stSum = a.status.reduce((s, x2) => s + x2.count, 0);
    if (stSum !== baseN) throw new Error(`${m.id} ${pfx || '总'} 状态合计 ${stSum} ≠ 帮助人数 ${baseN}`);
    for (const key of ['majors', 'hopeLocations', 'currentLocations', 'careers', 'anxieties', 'helpWanted', 'deepChat', 'riasec']) {
      const arr = a[key];
      if (arr.length !== 3) throw new Error(`${m.id} ${key} 不是 3 项`);
      if (arr[0].count < arr[1].count || arr[1].count < arr[2].count) throw new Error(`${m.id} ${key} 未递减`);
      if (arr.reduce((s, x2) => s + x2.count, 0) > baseN) throw new Error(`${m.id} ${key} 合计超过基数`);
      if (arr[0].count > baseN) throw new Error(`${m.id} ${key} 超过基数`);
    }
  }
}

// 报告
const ranked = [...result.byMentor.entries()].sort((a, b) => b[1] - a[1]);
console.log(`周期 ${PERIOD.start} ~ ${PERIOD.end}（${periodDays} 天）`);
console.log(`卡 ${allCards.length} 张（渠道命中 ${channelHit} / 行为命中 ${behaviorHit} / 归因失败 ${otherCards}），加榨消耗 ${allUses.length} 轮，其他池 ¥${result.otherAmount}`);
console.log('分档分布 1/3/6/10 ✓，新旧档位全部一致 ✓');
for (const [id, amount] of ranked) {
  const m = data.mentors.find((x) => x.id === id)!;
  console.log(`  ${tiers.get(id)} ${id.padEnd(12)} ¥${Math.round(amount).toLocaleString().padStart(7)}  (订阅 ${m.subscribers})`);
}
