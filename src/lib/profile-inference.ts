/**
 * 导师分身聊天中的实时档案推断（推断 vs 确认 来源分离）
 *
 * - extractInferredProfile: 每轮对话后用 LLM 轻量抽取用户新透露的档案信息
 * - mergeInferredProfile: 合并写入 UserProfile.inferredProfile（JSON），不覆盖已确认的主列
 * - renderInferredProfile: 渲染为总调度 Prompt 的 {{user_profile_inferred}} 文本
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
  "grade": "字符串或 null",
  "education": "高中|本科|硕士|博士|其他 或 null",
  "industry": "字符串或 null",
  "companyType": "国企|民企|外企|创业公司|互联网|其他 或 null",
  "gradYears": "整数或 null",
  "goals": "字符串或 null",
  "interests": ["字符串数组，无则 []"],
  "careerAnxiety": "字符串或 null",
  "jobChangeStatus": "字符串或 null"
}

只输出 JSON，不要任何解释文字。`;

export type InferredProfile = Record<string, unknown>;

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

/** 合并写入 inferredProfile（只写有值的字段，不覆盖主列） */
export async function mergeInferredProfile(userId: string, extracted: InferredProfile | null) {
  if (!extracted) return;

  const cleaned: InferredProfile = {};
  for (const [k, v] of Object.entries(extracted)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    cleaned[k] = v;
  }
  if (Object.keys(cleaned).length === 0) return;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { inferredProfile: true },
  });

  let existing: InferredProfile = {};
  if (profile?.inferredProfile) {
    try {
      existing = JSON.parse(profile.inferredProfile);
    } catch {
      existing = {};
    }
  }

  const merged = { ...existing, ...cleaned };

  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, inferredProfile: JSON.stringify(merged) },
    update: { inferredProfile: JSON.stringify(merged) },
  });
}

const FIELD_LABELS: Record<string, string> = {
  status: '状态',
  city: '城市',
  school: '学校',
  major: '专业',
  grade: '年级',
  education: '学历',
  industry: '行业',
  companyType: '公司类型',
  gradYears: '毕业年限',
  goals: '职业目标',
  interests: '兴趣方向',
  careerAnxiety: '职业焦虑',
  jobChangeStatus: '求职/换工作状态',
};

/** 渲染推断档案为文本（供 {{user_profile_inferred}} 使用） */
export function renderInferredProfile(json: string | null | undefined): string {
  if (!json) return '';
  let obj: InferredProfile;
  try {
    obj = JSON.parse(json);
  } catch {
    return '';
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    const label = FIELD_LABELS[k] || k;
    if (Array.isArray(v)) {
      if (v.length) parts.push(`${label}: ${v.join('、')}`);
    } else if (String(v).trim()) {
      parts.push(`${label}: ${String(v).trim()}`);
    }
  }
  return parts.join('；');
}
