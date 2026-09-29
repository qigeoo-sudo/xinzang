/**
 * 重新生成 audience.json — 17 类标准专业 + 27 类职业方向 + 正确结构
 * npx tsx scripts/gen-audience.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TOTAL = 440;

// 正态分布年龄 16-49 峰值 22
function normPdf(x: number, mean: number, sd: number) {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * 2.5066);
}
const ages: number[] = [];
const weights: number[] = [];
for (let a = 16; a <= 49; a++) weights.push(normPdf(a, 22, 6));
const weightSum = weights.reduce((s, w) => s + w, 0);
for (let a = 16; a <= 49; a++) {
  const count = Math.round((weights[a - 16] / weightSum) * TOTAL);
  for (let i = 0; i < count; i++) ages.push(a);
}
while (ages.length < TOTAL) ages.push(22);

const ageBand: Record<string, number> = {};
for (const a of ages) {
  let bucket = '';
  if (a <= 18) bucket = '16-18';
  else if (a <= 21) bucket = '19-21';
  else if (a <= 24) bucket = '22-24';
  else if (a <= 27) bucket = '25-27';
  else if (a <= 30) bucket = '28-30';
  else if (a <= 35) bucket = '31-35';
  else if (a <= 40) bucket = '36-40';
  else bucket = '41+';
  ageBand[bucket] = (ageBand[bucket] ?? 0) + 1;
}
const AGE_ORDER = ['16-18', '19-21', '22-24', '25-27', '28-30', '31-35', '36-40', '41+'];

// 状态
const status = { '在校': 180, '在职': 168, '待业': 92 };

// 17 类标准专业（来自 register-options MAJOR_OPTIONS）
const majors = {
  '计算机与信息技术': 68, '工程': 42, '数据与量化': 38, '会计': 36,
  '医学与健康': 30, '金融': 34, '商科与管理': 40, '法律': 22,
  '应急与公共安全': 8, '社会科学与公共管理': 18, '教育与社会服务': 24,
  '畜牧兽医与水产': 4, '体育学': 12, '自然科学': 16,
  '人文与创意': 28, '农林': 6, '食品': 10, '其他': 4,
};

// 27 类职业方向（来自 register-options CAREER_OPTIONS）
const careers = {
  'accounting_advisory': 38, 'ai': 28, 'banking_finance': 32, 'career_skills': 42,
  'consulting': 30, 'client_services': 14, 'data': 36, 'design_ux': 28,
  'education': 22, 'engineering': 34, 'entrepreneurship': 18, 'government': 16,
  'healthcare': 20, 'hr': 26, 'insurance': 12, 'law': 14,
  'life_sciences': 8, 'marketing': 30, 'military': 4, 'product_management': 24,
  'project_management': 20, 'real_estate': 10, 'retail': 12, 'sales': 18,
  'security': 10, 'software_it': 44, 'supply_chain': 16,
};
const careerLabels: Record<string, string> = {
  'accounting_advisory': '会计与审计', 'ai': '人工智能', 'banking_finance': '银行与金融',
  'career_skills': '职业发展与面试技巧', 'consulting': '咨询与战略', 'client_services': '客户成功与客户管理',
  'data': '数据与分析', 'design_ux': '设计与用户体验', 'education': '教育',
  'engineering': '工程', 'entrepreneurship': '创业', 'government': '政府与公共服务',
  'healthcare': '医疗健康', 'hr': '人力资源与招聘', 'insurance': '保险',
  'law': '法律', 'life_sciences': '生命科学', 'marketing': '市场营销',
  'military': '军队与军工', 'product_management': '产品管理', 'project_management': '项目管理',
  'real_estate': '房地产', 'retail': '零售与消费品', 'sales': '销售',
  'security': '网络安全', 'software_it': '软件工程与 IT', 'supply_chain': '供应链与物流',
};

// 帮助需求
const helpPriority = {
  '帮我看清自己适合什么': 95, '受挫后帮我复盘并给出具体建议': 88,
  '告诉我行业岗位真实情况': 76, '教我具体求职技巧': 62,
  '帮我做职业规划': 58, '帮我准备面试': 45, '其他': 16,
};

// 深聊对象
const mentorPreference = {
  '资深HR': 72, '目标单位在职员工': 58, '心理咨询师': 52, '行业大咖': 48,
  '职业规划师': 44, '学哥学姐': 42, '猎头': 38, '创业导师': 32,
  '其他': 28, '家人': 16, '好友': 10,
};

// RIASEC
const riasecPrimary = { 'R': 85, 'I': 92, 'A': 78, 'S': 70, 'E': 65, 'C': 50 };
const riasecCombo = {
  'IRA': 28, 'IAS': 25, 'SEC': 24, 'EAC': 22, 'CRE': 20,
  'AES': 18, 'SCR': 16, 'RIE': 15, 'ICE': 14, 'ARS': 12,
  '其他': 236,
};

// 省份
const provinces = {
  '上海': 95, '北京': 62, '广东': 48, '浙江': 40, '江苏': 38,
  '四川': 28, '湖北': 24, '湖南': 22, '福建': 18, '山东': 18,
  '河南': 14, '陕西': 10, '安徽': 8, '江西': 7, '重庆': 6,
  '其他': 2,
};

// 焦虑归类
const anxietyCategories = [
  { category: '求职迷茫/不知适合什么', count: 68 },
  { category: '面试焦虑/发挥失常', count: 52 },
  { category: '职业选择困难/offer纠结', count: 45 },
  { category: '能力焦虑/感觉什么都不精', count: 38 },
  { category: '转行/跨专业困难', count: 32 },
  { category: '工作倦怠/看不到成长', count: 28 },
  { category: '家庭期望冲突', count: 22 },
  { category: '同辈压力/比较焦虑', count: 18 },
];

function toDim(dist: Record<string, number>) {
  const entries = Object.entries(dist);
  const other = entries.filter(([k]) => k === '其他');
  const rest = entries.filter(([k]) => k !== '其他').sort((a, b) => b[1] - a[1]);
  const sorted = [...rest, ...other];
  const sampleSize = sorted.reduce((s, [, n]) => s + n, 0);
  return { sampleSize, dist: sorted, suppressed: sampleSize < 5 };
}

const audience = {
  totalQualified: TOTAL,
  dimensions: {
    status: toDim(status),
    ageBand: { ...toDim(ageBand), dist: AGE_ORDER.map(k => [k, ageBand[k] ?? 0]).filter(([, n]) => n > 0) },
    major: toDim(majors),
    careers: { ...toDim(careers), topNote: 'Top 10 已标注' },
    helpPriority: toDim(helpPriority),
    mentorPreference: toDim(mentorPreference),
    riasecPrimary: toDim(riasecPrimary),
    riasecCombo: toDim(riasecCombo),
    curProvince: toDim(provinces),
    workProvince: toDim(provinces),
  },
  careerLabels,
  anxiety: {
    categories: anxietyCategories,
    asOf: '2026-09-29',
    sourceCount: TOTAL,
  },
};

const outDir = join(process.cwd(), 'public', 'demo');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'audience.json'), JSON.stringify(audience, null, 2));
console.log('audience.json saved');
console.log('majors:', Object.keys(majors).length, '类');
console.log('careers:', Object.keys(careers).length, '类');
