/**
 * 平台数据后台「用户」「渠道」两个 tab 的 demo 数据生成器（确定性，可复跑）：
 * - public/demo/admin/users.json：构成汇总 + 80 行用户明细样本
 * - public/demo/admin/channels-summary.json：渠道汇总 + 渠道明细
 * 导师渠道引流数与 mentors.json 的 referrals 对齐；角色枚举对齐 schema（USER/ADMIN/ADMIN_FULL/MENTOR_HUMAN）
 * 运行：node scripts/gen-admin-entity-demo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = process.cwd();
const MENTORS_JSON = `${ROOT}/public/demo/admin/mentors.json`;
const USERS_OUT = `${ROOT}/public/demo/admin/users.json`;
const CH_OUT = `${ROOT}/public/demo/admin/channels-summary.json`;
const START = '2026-07-09';
const END = '2026-10-01';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => { let h = 0; for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return h; };
const rnd = mulberry32(seedOf('admin-entity-demo:v1'));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const mentorsData = JSON.parse(readFileSync(MENTORS_JSON, 'utf-8'));
const REAL_MENTORS = mentorsData.mentors.slice(0, 8);

// ---------- 用户明细 ----------
const SURNAMES = ['陈', '李', '张', '王', '刘', '黄', '吴', '周', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧', '程', '曹'];
const GIVEN = ['子涵', '欣怡', '梓萱', '雨泽', '浩然', '诗涵', '一诺', '亦可', '梦琪', '嘉怡', '思远', '若曦', '昱辰', '沐阳', '知许', '星野', '清扬', '安然', '书瑶', '景行', '之琳', '未晞', '南乔', '北屿', '砚秋', '听澜', '望舒', '怀瑾', '扶苏', '半夏'];
const STATUSES = ['在职', '在校', '待业'];
const STATUS_W = [0.56, 0.34, 0.1];
const PAY_STATES = [
  { key: 'subscribed', label: '订阅中', w: 0.154 },       // 452/2933
  { key: 'creditPack', label: '仅加榨包', w: 0.024 },     // 96-重叠≈69 → 取 0.024
  { key: 'trial', label: '免费试用', w: 0.18 },
  { key: 'free', label: '未付费', w: 0.642 },
];
function weighted(list) {
  const r = rnd(); let acc = 0;
  for (const x of list) { acc += x.w ?? 1; if (r <= acc) return x; }
  return list[list.length - 1];
}
const ORG_CHANNELS = ['官网直接访问', '小红书官方号', '抖音官方号', '高校合作-华东师大', '高校合作-深大', 'B站合作投放'];
const startTs = new Date(`${START}T00:00:00Z`).getTime();
const endTs = new Date(`${END}T00:00:00Z`).getTime();
const fmtDate = (ts) => new Date(ts).toISOString().slice(0, 10);

// 8 位真人导师账号 + 2 个管理员 + 其余普通用户，共 80 行
const rows = [];
REAL_MENTORS.forEach((m, i) => {
  rows.push({
    id: `u_mentor_${m.id}`,
    phone: `138****${String(2000 + i * 137).slice(-4)}`,
    name: m.chineseName,
    role: 'MENTOR_HUMAN',
    boundMentor: m.name,
    status: '在职',
    payState: '未付费',
    registeredAt: m.importedAt,
    channel: '内部开通',
  });
});
rows.push(
  { id: 'u_admin_1', phone: '158****1617', name: '管理员', role: 'ADMIN_FULL', boundMentor: null, status: '在职', payState: '未付费', registeredAt: '2026-07-09', channel: '内部开通' },
  { id: 'u_admin_2', phone: '139****0821', name: '运营小王', role: 'ADMIN', boundMentor: null, status: '在职', payState: '未付费', registeredAt: '2026-07-12', channel: '内部开通' },
);
for (let i = rows.length; i < 80; i++) {
  const paid = weighted(PAY_STATES);
  const viaMentor = rnd() < 0.36;
  const mentor = pick(REAL_MENTORS);
  rows.push({
    id: `u_demo_${String(10000 + i)}`,
    phone: `1${pick(['38', '58', '86', '35', '77', '99'])}****${String(int(100, 9999)).padStart(4, '0')}`,
    name: pick(SURNAMES) + pick(GIVEN),
    role: 'USER',
    boundMentor: viaMentor ? mentor.name : null,
    status: weighted(STATUS_W.map((w, j) => ({ label: STATUSES[j], w }))).label,
    payState: paid.label,
    registeredAt: fmtDate(startTs + rnd() * (endTs - startTs)),
    channel: viaMentor ? `${mentor.name} 专属渠道` : pick(ORG_CHANNELS),
  });
}
rows.sort((a, b) => (a.registeredAt < b.registeredAt ? 1 : -1));

const usersJson = {
  dateRange: { start: START, end: END },
  summary: {
    total: 2933,
    newInRange: 438,
    paid: 521,
    active7d: 612,
    byRole: [
      { label: '普通用户', count: 2923 },
      { label: '真人导师', count: 8 },
      { label: '管理员', count: 2 },
    ],
    byStatus: [
      { label: '在职', count: 1268 },
      { label: '在校', count: 758 },
      { label: '待业', count: 187 },
    ],
    payFunnel: [
      { label: '订阅用户', count: 452 },
      { label: '加榨包用户', count: 96 },
      { label: '免费试用', count: 1047 },
      { label: '未付费', count: 1692 },
    ],
  },
  rows,
};
writeFileSync(USERS_OUT, JSON.stringify(usersJson, null, 2) + '\n', 'utf-8');

// ---------- 渠道汇总 ----------
const PLATFORM = [
  { code: 'direct', name: '官网直接访问', partner: '心章科技（官方）', kind: 'official' },
  { code: 'xhs_official', name: '小红书官方号', partner: '心章科技（官方）', kind: 'official' },
  { code: 'dy_official', name: '抖音官方号', partner: '心章科技（官方）', kind: 'official' },
  { code: 'edu_ecnu', name: '高校合作-华东师大', partner: '华东师范大学就业指导中心', kind: 'org' },
  { code: 'edu_szu', name: '高校合作-深大', partner: '深圳大学学生发展部', kind: 'org' },
  { code: 'bili_ad', name: 'B站合作投放', partner: '广州橙光营销策划有限公司', kind: 'org' },
];
const chRows = [];
// 导师渠道：引流数取 mentors.json referrals，保证两表自洽
for (const m of REAL_MENTORS) {
  const slug = m.id.replace(/[^a-z]/g, '').slice(0, 5);
  const regs = m.referrals;
  const paid = Math.round(regs * (0.32 + rnd() * 0.14));
  chRows.push({
    code: `xhs_${slug}01`,
    name: `小红书-${m.name}`,
    partner: m.name,
    kind: 'mentor',
    registrations: regs,
    paidUsers: paid,
    subRevenueYuan: Math.round(m.revenueYuan * (0.55 + rnd() * 0.2)),
    creditRevenueYuan: Math.round(paid * (12 + rnd() * 14)),
    lastRegisteredAt: fmtDate(endTs - int(0, 12) * 86400000),
  });
}
// 官方/机构渠道
for (const p of PLATFORM) {
  const regs = int(60, 420);
  const paid = Math.round(regs * (0.1 + rnd() * 0.12));
  chRows.push({
    code: p.code,
    name: p.name,
    partner: p.partner,
    kind: p.kind,
    registrations: regs,
    paidUsers: paid,
    subRevenueYuan: Math.round(paid * int(60, 180)),
    creditRevenueYuan: Math.round(paid * int(6, 20)),
    lastRegisteredAt: fmtDate(endTs - int(0, 20) * 86400000),
  });
}
chRows.sort((a, b) => b.registrations - a.registrations);
const sum = (k) => chRows.reduce((s, x) => s + x[k], 0);

const channelsJson = {
  dateRange: { start: START, end: END },
  summary: {
    channelCount: chRows.length,
    mentorChannelCount: chRows.filter((x) => x.kind === 'mentor').length,
    orgChannelCount: chRows.filter((x) => x.kind !== 'mentor').length,
    totalRegistrations: sum('registrations'),
    totalPaid: sum('paidUsers'),
    totalRevenueYuan: sum('subRevenueYuan') + sum('creditRevenueYuan'),
  },
  rows: chRows,
};
writeFileSync(CH_OUT, JSON.stringify(channelsJson, null, 2) + '\n', 'utf-8');

// 自洽校验
const mentorRefSum = REAL_MENTORS.reduce((s, m) => s + m.referrals, 0);
const chMentorSum = chRows.filter((x) => x.kind === 'mentor').reduce((s, x) => s + x.registrations, 0);
if (mentorRefSum !== chMentorSum) throw new Error(`导师引流不一致 ${mentorRefSum} vs ${chMentorSum}`);
console.log(`users.json: ${rows.length} 行明细`);
console.log(`channels-summary.json: ${chRows.length} 个渠道，导师引流自洽 ${chMentorSum} 人，总注册 ${sum('registrations')}`);
