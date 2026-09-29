/**
 * 导师受众画像聚合 — GET /api/mentor/audience
 * 只统计与绑定分身有完成问答轮的 NORMAL 用户；任一维度样本 <5 则屏蔽该维度。
 *
 * 排序规则：
 * - 状态：固定 在校/在职/待业
 * - 年龄段：固定 17岁及以下 → 31岁及以上（18-30 逐岁）
 * - 专业/职业方向：按数量降序，超过 10 类时只展示 Top 10 并加注
 * - 其余：按数量降序
 * - 焦虑归类来自每日聚合（LLM），读最近一天 payload
 */
import { prisma } from '@/lib/prisma';
import { requireMentorContext, errorResponse } from '@/lib/mentor-console-api';
import { isCompletedSource } from '@/lib/aggregation';
import { CAREER_OPTIONS } from '@/lib/register-options';

type CountMap = Record<string, number>;
type Pair = [string, number];

function addTo(map: CountMap, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** 解析 JSON 数组字符串字段 */
function parseArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 降序 top N；返回（行，是否截断） */
function topN(map: CountMap, n: number): { rows: Pair[]; truncated: boolean } {
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return {
    rows: sorted.slice(0, n),
    truncated: sorted.length > n,
  };
}

/** 按固定顺序输出非零项 */
function fixedOrder(map: CountMap, order: string[]): Pair[] {
  return order.filter((k) => (map[k] ?? 0) > 0).map((k) => [k, map[k]]);
}

const MIN_SAMPLE = 5;

// 固定顺序
const STATUS_ORDER = ['在校', '在职', '待业'];
const AGE_ORDER = [
  '17岁及以下',
  '18岁', '19岁', '20岁', '21岁', '22岁', '23岁', '24岁',
  '25岁', '26岁', '27岁', '28岁', '29岁', '30岁',
  '31岁及以上',
];

const CAREER_LABELS: Record<string, string> = Object.fromEntries(
  CAREER_OPTIONS.map((o) => [o.value, o.label]),
);

export async function GET() {
  try {
    const { mentorId } = await requireMentorContext();

    // 有完成问答轮的用户（NORMAL），带画像与测评
    const sessions = await prisma.chatSession.findMany({
      where: { mentorId },
      select: { userId: true, user: { select: { userGroup: true } } },
    });
    const candidateIds = [
      ...new Set(
        sessions.filter((s) => s.user.userGroup === 'NORMAL').map((s) => s.userId),
      ),
    ];

    const users = await prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        profile: {
          select: {
            status: true,
            birthMonth: true,
            major: true,
            curProvince: true,
            workProvince: true,
            careers: true,
            helpPriority: true,
            mentorPreference: true,
          },
        },
        interestAssessment: { select: { code: true } },
        chatSessions: {
          where: { mentorId },
          select: {
            messages: {
              where: { role: 'assistant' },
              select: { entitlementSource: true },
            },
          },
        },
      },
    });

    // 必须确实完成过问答轮
    const qualified = users.filter((u) =>
      u.chatSessions.some((s) => s.messages.some((m) => isCompletedSource(m.entitlementSource))),
    );

    const now = new Date();
    const maps: Record<string, CountMap> = {
      status: {},
      ageBand: {},
      major: {},
      curProvince: {},
      workProvince: {},
      riasecPrimary: {},
      riasecCombo: {},
      careers: {},
      helpPriority: {},
      mentorPreference: {},
    };
    const sampleSize: Record<string, number> = Object.fromEntries(
      Object.keys(maps).map((k) => [k, 0]),
    );

    const bump = (dim: string, key: string) => {
      addTo(maps[dim], key);
      sampleSize[dim]++;
    };

    for (const u of qualified) {
      const p = u.profile;
      if (p?.status) bump('status', p.status);
      if (p?.major) bump('major', p.major);
      if (p?.curProvince) bump('curProvince', p.curProvince);
      if (p?.workProvince) bump('workProvince', p.workProvince);

      if (p?.birthMonth && /^\d{4}-\d{2}$/.test(p.birthMonth)) {
        const bYear = parseInt(p.birthMonth.slice(0, 4), 10);
        const bMonth = parseInt(p.birthMonth.slice(5, 7), 10);
        let age = now.getUTCFullYear() - bYear;
        if (now.getUTCMonth() + 1 < bMonth) age -= 1;
        const band =
          age <= 17 ? '17岁及以下'
          : age >= 31 ? '31岁及以上'
          : `${age}岁`;
        bump('ageBand', band);
      }

      const code = u.interestAssessment?.code;
      if (code && code.length >= 3) {
        bump('riasecPrimary', code.charAt(0));
        bump('riasecCombo', code.slice(0, 3));
      }

      for (const c of parseArray(p?.careers)) bump('careers', c);
      for (const h of parseArray(p?.helpPriority)) bump('helpPriority', h);
      for (const m of parseArray(p?.mentorPreference)) bump('mentorPreference', m);
    }

    const packFixed = (dim: string, order: string[]): DimResponse => ({
      sampleSize: sampleSize[dim],
      ...(sampleSize[dim] >= MIN_SAMPLE
        ? { dist: fixedOrder(maps[dim], order) }
        : { suppressed: true }),
    });

    const packTop = (dim: string, limit: number): DimResponse => {
      if (sampleSize[dim] < MIN_SAMPLE) {
        return { sampleSize: sampleSize[dim], suppressed: true };
      }
      const { rows, truncated } = topN(maps[dim], limit);
      return { sampleSize: sampleSize[dim], dist: rows, ...(truncated ? { topNote: `Top ${limit}` } : {}) };
    };

    // 焦虑归类：读最近一天聚合 payload
    const anxietyRow = await prisma.dailyMentorStats.findFirst({
      where: { mentorId, metricKey: 'mentor.anxiety_categories' },
      orderBy: { date: 'desc' },
      select: { payload: true, date: true },
    });
    let anxiety: AnxietyResponse = { categories: [] };
    if (anxietyRow?.payload) {
      try {
        const payload = JSON.parse(anxietyRow.payload) as
          | { category: string; count: number }[]
          | { unavailable: boolean; sourceCount?: number };
        if (Array.isArray(payload)) {
          anxiety = {
            categories: payload,
            // 存储值为北京日零点（UTC 前一日 16:00），按北京日展示
            asOf: new Date(anxietyRow.date.getTime() + 8 * 3600_000)
              .toISOString()
              .slice(0, 10),
          };
        } else if (payload.unavailable) {
          anxiety = { categories: [], unavailable: true, sourceCount: payload.sourceCount ?? 0 };
        }
      } catch {
        anxiety = { categories: [] };
      }
    }

    return Response.json({
      totalQualified: qualified.length,
      dimensions: {
        status: packFixed('status', STATUS_ORDER),
        ageBand: packFixed('ageBand', AGE_ORDER),
        major: packTop('major', 10),
        curProvince: packTop('curProvince', 12),
        workProvince: packTop('workProvince', 12),
        riasecPrimary: packTop('riasecPrimary', 6),
        riasecCombo: packTop('riasecCombo', 5),
        careers: packTop('careers', 10),
        helpPriority: packTop('helpPriority', 8),
        mentorPreference: packTop('mentorPreference', 12),
      },
      careerLabels: CAREER_LABELS,
      anxiety,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

interface DimResponse {
  sampleSize: number;
  dist?: Pair[];
  suppressed?: boolean;
  topNote?: string;
}

interface AnxietyResponse {
  categories: { category: string; count: number }[];
  asOf?: string;
  unavailable?: boolean;
  sourceCount?: number;
}
