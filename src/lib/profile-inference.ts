/**
 * 导师分身聊天中的实时档案推断 + 语义对齐/冲突合并（推断 vs 确认 来源分离）
 *
 * - extractInferredProfile: 每轮对话后用 LLM 轻量抽取用户新透露的档案信息
 * - alignAndMergeInferredProfile: 新推断与已确认做语义对齐：
 *     · 无已确认 → 记为推断（inferredProfile）
 *     · 语义一致（经济学 vs 经济方面）→ 合并去重，不产生冲突
 *     · 语义冲突（经济学 vs 园林工程）→ 记为待处理冲突（profileConflicts），由用户在档案页拍板
 * - resolveProfileConflict: 用户在档案页选择「保留已确认 / 采用推断」后落地
 * - renderInferredProfile: 渲染推断档案 + 待处理冲突（供 {{user_profile_inferred}}）
 *
 * 说明: 主列字段 = 用户已确认信息；inferredProfile = 聊天中推断、尚未经用户确认的信息。
 */
import { prisma } from '@/lib/prisma';
import { proxyFetch } from '@/lib/proxy-fetch';

const INFER_PROMPT = `你是信息提取助手。以下是一轮「导师分身与用户」的对话。请提取用户在对话中新透露的、可用于个人档案的客观信息，并只输出 JSON。

规则：
- 只提取用户明确陈述或强烈暗示的客观信息；不要臆测用户没有表达的内容。
- 如果对话中没有新的档案信息，所有字段返回 null（数组返回 []）。

JSON 格式：
{
  "status": "在校|在职|待业 或 null",
  "city": "字符串或 null",
  "school": "字符串或 null",
  "major": "字符串或 null",
  "enrollmentYear": "字符串或 null（如 2022）",
  "industry": "字符串或 null",
  "companyType": "国企|民企|外企|创业公司|互联网|其他 或 null",
  "gradYears": "整数或 null",
  "goals": "字符串或 null",
  "interests": ["字符串数组，无则 []"],
  "careerAnxiety": "字符串或 null",
  "jobChangeStatus": "字符串或 null"
}

只输出 JSON，不要任何解释文字。`;

/** 可参与语义对齐的字段（与 UserProfile 主列字段名一致） */
const ALIGNABLE_FIELDS = [
  'status',
  'city',
  'school',
  'major',
  'enrollmentYear',
  'industry',
  'companyType',
  'gradYears',
  'goals',
  'interests',
  'careerAnxiety',
  'jobChangeStatus',
];

const ALIGN_PROMPT = `你是用户档案一致性判断助手。下面每一对「已确认值 / 新推断值」来自用户档案的同一个字段。请判断两者是否指同一件事。

只输出一个 JSON 对象，字段名与输入一致，值为 "same" 或 "conflict"：
- same：含义一致，只是表述不同（如 "经济学" vs "经济方面"、"上海" vs "魔都"）。字段值随时间自然变化（如在职状态）也视为 same。
- conflict：含义不同或相互矛盾（如 "经济学" vs "园林工程"、"在读" vs "已工作"）。

输入示例：
{"major": {"confirmed": "经济学", "inferred": "经济方面"}}
输出示例：
{"major": "same"}

只输出 JSON，不要任何解释文字。`;

export type InferredProfile = Record<string, unknown>;

export interface ProfileConflict {
  field: string;
  confirmedValue: string;
  inferredValue: unknown;
  status: 'pending' | 'resolved';
  createdAt: string;
}

/** 从一轮对话中轻量抽取用户档案信息，失败时返回 null */
export async function extractInferredProfile(opts: {
  apiKey: string;
  apiUrl: string;
  model: string;
  userMessage: string;
  assistantReply: string;
}): Promise<InferredProfile | null> {
  try {
    const res = await proxyFetch(`${opts.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: INFER_PROMPT },
          { role: 'user', content: `用户: ${opts.userMessage}\n\n导师: ${opts.assistantReply}` },
        ],
        temperature: 0.1,
        max_tokens: 600,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || '')
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : raw) as InferredProfile;
  } catch (e) {
    console.error('Infer profile failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** 去掉空值，仅保留有内容的字段 */
function cleanExtracted(extracted: InferredProfile): InferredProfile {
  const cleaned: InferredProfile = {};
  for (const [k, v] of Object.entries(extracted)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    cleaned[k] = v;
  }
  return cleaned;
}

/** 把值转成可比较的文本（数组/JSON 字符串 → 顿号连接） */
function toText(value: unknown): string {
  if (Array.isArray(value)) return value.join('、');
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p.join('、');
    } catch {
      // not JSON
    }
    return value;
  }
  return String(value ?? '').trim();
}

/** 用 LLM 对「已确认 vs 推断」逐字段判断 same/conflict */
async function classifyFields(
  opts: { apiKey: string; apiUrl: string; model: string },
  pairs: Record<string, { confirmed: unknown; inferred: unknown }>
): Promise<Record<string, 'same' | 'conflict'>> {
  const input: Record<string, { confirmed: string; inferred: string }> = {};
  for (const [f, p] of Object.entries(pairs)) {
    input[f] = { confirmed: toText(p.confirmed), inferred: toText(p.inferred) };
  }
  try {
    const res = await proxyFetch(`${opts.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: ALIGN_PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
        temperature: 0,
        max_tokens: 300,
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw) as Record<string, string>;
    const result: Record<string, 'same' | 'conflict'> = {};
    for (const [f, v] of Object.entries(parsed)) {
      if (v === 'same' || v === 'conflict') result[f] = v;
    }
    return result;
  } catch (e) {
    console.error('Align profile failed:', e instanceof Error ? e.message : e);
    return {};
  }
}

function upsertConflict(
  conflicts: ProfileConflict[],
  field: string,
  confirmedValue: string,
  inferredValue: unknown
): void {
  const existing = conflicts.find((c) => c.field === field && c.status === 'pending');
  if (existing) {
    existing.confirmedValue = confirmedValue;
    existing.inferredValue = inferredValue;
  } else {
    conflicts.push({
      field,
      confirmedValue,
      inferredValue,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }
}

/**
 * 语义对齐 + 合并写库：
 * 推断与已确认逐字段比对 → 一致则去重；冲突则存待处理冲突；无已确认则记为推断。
 */
export async function alignAndMergeInferredProfile(
  userId: string,
  extracted: InferredProfile | null,
  opts: { apiKey: string; apiUrl: string; model: string }
): Promise<void> {
  const cleaned = cleanExtracted(extracted ?? {});
  if (Object.keys(cleaned).length === 0) return;

  const select: Record<string, boolean> = {};
  for (const f of ALIGNABLE_FIELDS) select[f] = true;
  select.inferredProfile = true;
  select.profileConflicts = true;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: select as any,
  });

  if (!profile) return;

  // 已确认值（主列）
  const confirmed: Record<string, string> = {};
  for (const f of ALIGNABLE_FIELDS) {
    const v = (profile as any)?.[f];
    const t = toText(v);
    if (t) confirmed[f] = t;
  }

  let existingInferred: InferredProfile = {};
  if (profile?.inferredProfile) {
    try { existingInferred = JSON.parse(profile.inferredProfile); } catch { existingInferred = {}; }
  }
  let conflicts: ProfileConflict[] = [];
  if (profile?.profileConflicts) {
    try { conflicts = JSON.parse(profile.profileConflicts); } catch { conflicts = []; }
  }

  // 仅对「已有确认值」的字段做语义判断
  const toClassify: Record<string, { confirmed: unknown; inferred: unknown }> = {};
  for (const [f, v] of Object.entries(cleaned)) {
    if (!ALIGNABLE_FIELDS.includes(f)) continue;
    if (confirmed[f]) toClassify[f] = { confirmed: confirmed[f], inferred: v };
  }
  const classification = Object.keys(toClassify).length > 0
    ? await classifyFields(opts, toClassify)
    : {};

  // 应用结果
  const newInferred: InferredProfile = { ...existingInferred };
  for (const [f, v] of Object.entries(cleaned)) {
    if (!ALIGNABLE_FIELDS.includes(f)) {
      newInferred[f] = v;
      continue;
    }
    if (confirmed[f]) {
      const verdict = classification[f];
      if (verdict === 'conflict') {
        newInferred[f] = v;
        upsertConflict(conflicts, f, confirmed[f], v);
      } else {
        // same（或无法判断）→ 合并去重：不重复记录推断
        delete newInferred[f];
        conflicts = conflicts.filter((c) => c.field !== f);
      }
    } else {
      newInferred[f] = v;
    }
  }

  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      inferredProfile: JSON.stringify(newInferred),
      profileConflicts: JSON.stringify(conflicts),
    },
    update: {
      inferredProfile: JSON.stringify(newInferred),
      profileConflicts: JSON.stringify(conflicts),
    },
  });
}

/** 用户在档案页解决冲突：choice = 'confirmed' | 'inferred' */
export async function resolveProfileConflict(
  userId: string,
  field: string,
  choice: 'confirmed' | 'inferred'
): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { inferredProfile: true, profileConflicts: true },
  });

  if (!profile) return;

  let conflicts: ProfileConflict[] = [];
  if (profile?.profileConflicts) {
    try { conflicts = JSON.parse(profile.profileConflicts); } catch { conflicts = []; }
  }
  const conflict = conflicts.find((c) => c.field === field && c.status === 'pending');
  if (!conflict) return;

  let inferred: InferredProfile = {};
  if (profile?.inferredProfile) {
    try { inferred = JSON.parse(profile.inferredProfile); } catch { inferred = {}; }
  }

  if (choice === 'inferred') {
    const val = inferred[field];
    if (val !== undefined) {
      const columnValue = Array.isArray(val) ? JSON.stringify(val) : (val as string | number);
      await prisma.userProfile.update({
        where: { userId },
        data: { [field]: columnValue, profileSource: 'mixed' } as any,
      });
    }
  }

  delete inferred[field];
  conflicts = conflicts.filter((c) => c.field !== field);

  await prisma.userProfile.update({
    where: { userId },
    data: {
      inferredProfile: JSON.stringify(inferred),
      profileConflicts: JSON.stringify(conflicts),
    },
  });
}

const FIELD_LABELS: Record<string, string> = {
  status: '状态',
  city: '城市',
  school: '学校',
  major: '专业',
  enrollmentYear: '入学年份',
  industry: '行业',
  companyType: '公司类型',
  gradYears: '毕业年限',
  goals: '职业目标',
  interests: '兴趣方向',
  careerAnxiety: '职业焦虑',
  jobChangeStatus: '求职/换工作状态',
};

/** 渲染推断档案 + 待处理冲突（供 {{user_profile_inferred}} 使用） */
export function renderInferredProfile(
  inferredJson: string | null | undefined,
  conflictsJson: string | null | undefined
): string {
  const parts: string[] = [];

  if (inferredJson) {
    try {
      const obj = JSON.parse(inferredJson) as InferredProfile;
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        const label = FIELD_LABELS[k] || k;
        if (Array.isArray(v)) {
          if (v.length) parts.push(`${label}: ${v.join('、')}`);
        } else if (String(v).trim()) {
          parts.push(`${label}: ${String(v).trim()}`);
        }
      }
    } catch {
      // ignore
    }
  }

  if (conflictsJson) {
    try {
      const conflicts = JSON.parse(conflictsJson) as ProfileConflict[];
      for (const c of conflicts) {
        if (c.status !== 'pending') continue;
        const label = FIELD_LABELS[c.field] || c.field;
        parts.push(`${label}存在不一致：已确认「${c.confirmedValue}」，推断「${toText(c.inferredValue)}」，以用户确认为准`);
      }
    } catch {
      // ignore
    }
  }

  return parts.join('；');
}
