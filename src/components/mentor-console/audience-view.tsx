'use client';

/** 用户画像：仅展示与分身有有效对话用户的聚合分布；样本 <5 屏蔽
 *  状态/年龄固定顺序；专业/职业方向 Top 10 加注；焦虑为 LLM 归类文本框
 *  每张卡支持柱状图/饼图切换；类别统一配色 */
import { useState } from 'react';
import { useApi } from './use-api';
import { ViewState } from './stat-card';

type Pair = [string, number];

interface Dim {
  sampleSize: number;
  dist?: Pair[];
  suppressed?: boolean;
  topNote?: string;
}

interface AudienceResponse {
  totalQualified: number;
  dimensions: Record<string, Dim>;
  careerLabels: Record<string, string>;
  anxiety: {
    categories: { category: string; count: number }[];
    asOf?: string;
    unavailable?: boolean;
    sourceCount?: number;
  };
}

const RIASEC_NAMES: Record<string, string> = {
  R: '现实型 R',
  I: '研究型 I',
  A: '艺术型 A',
  S: '社会型 S',
  E: '企业型 E',
  C: '常规型 C',
};

/** 统一类别色板（12 色循环），首色青绿 */
const PALETTE = [
  '#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4',
  '#EC4899', '#10B981', '#F97316', '#6366F1', '#84CC16', '#6366F1',
];

function colorAt(i: number) {
  return PALETTE[i % PALETTE.length];
}

/** "其他"永远排最后 */
function sortDist(entries: [string, number][]): [string, number][] {
  const other = entries.filter(([k]) => k === '其他');
  const rest = entries.filter(([k]) => k !== '其他').sort((a, b) => b[1] - a[1]);
  return [...rest, ...other];
}

function DistributionCard({
  title,
  dim,
  labelMap,
}: {
  title: string;
  dim?: Dim;
  labelMap?: Record<string, string>;
}) {
  const [mode, setMode] = useState<'bar' | 'pie'>('bar');

  return (
    <div className="rounded-2xl border-t-2 border-t-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="text-xs text-stone-500">{title}</p>
          {dim?.topNote && (
            <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
              {dim.topNote}
            </span>
          )}
        </div>
        {dim && !dim.suppressed && dim.dist && dim.dist.length > 1 && (
          <div className="flex gap-0.5 rounded-lg bg-stone-100 p-0.5">
            {(['bar', 'pie'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  mode === m ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'
                }`}
              >
                {m === 'bar' ? '柱图' : '饼图'}
              </button>
            ))}
          </div>
        )}
      </div>
      {dim?.suppressed || !dim ? (
        <p className="mt-3 text-xs leading-5 text-stone-400">
          样本不足 5 人，暂不展示（当前 {dim?.sampleSize ?? 0} 人）
        </p>
      ) : mode === 'bar' ? (
        <div className="mt-3 space-y-2">
          {dim.dist?.map(([label, n], i) => {
            const pct = dim.sampleSize ? Math.round((n / dim.sampleSize) * 100) : 0;
            const display = labelMap?.[label] ?? label;
            return (
              <div key={label}>
                <div className="flex justify-between text-xs text-stone-600">
                  <span className="truncate pr-2">{display}</span>
                  <span className="shrink-0 text-stone-400">{n} · {pct}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colorAt(i) }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <PieChart dim={dim} labelMap={labelMap} />
      )}
    </div>
  );
}

/** 简易 SVG 饼图 — 大直径，标签靠右 */
function PieChart({ dim, labelMap }: { dim: Dim; labelMap?: Record<string, string> }) {
  if (!dim.dist || dim.dist.length === 0) return null;
  const total = dim.sampleSize || 1;
  const R = 110;
  const CX = 120;
  const CY = 120;
  const SVG_SIZE = 240;
  let angle = -Math.PI / 2; // 从顶部开始

  const slices = dim.dist.map(([label, n], i) => {
    const pct = n / total;
    const startAngle = angle;
    const endAngle = angle + pct * 2 * Math.PI;
    angle = endAngle;

    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const largeArc = pct > 0.5 ? 1 : 0;
    const color = colorAt(i);
    const display = labelMap?.[label] ?? label;
    const pctRounded = Math.round(pct * 100);

    return { path: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`, color, display, n, pctRounded };
  });

  const showLabel = (pct: number) => pct >= 5;

  return (
    <div className="mt-3 flex items-center gap-4">
      <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} className="shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={1.5} />
        ))}
      </svg>
      <div className="flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] text-stone-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.display}</span>
            <span className="shrink-0 text-stone-400">{s.n} · {s.pctRounded}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 焦虑归类卡：柱/饼切换，复用 PieChart */
function AnxietyCard({ anxiety }: { anxiety: AudienceResponse['anxiety'] }) {
  const [mode, setMode] = useState<'bar' | 'pie'>('bar');

  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <p className="text-xs text-stone-500">最大的焦虑（LLM 归类）</p>
      {anxiety.asOf && (
        <span className="text-[10px] text-stone-400">截至 {anxiety.asOf}</span>
      )}
    </div>
  );

  if (anxiety.unavailable) {
    return (
      <div className="rounded-2xl border-t-2 border-t-rose-300 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        {header}
        <p className="mt-3 text-xs leading-5 text-stone-400">
          暂未生成归类（焦虑原文 {anxiety.sourceCount ?? 0} 份），将在下次每日汇总后出现。
        </p>
      </div>
    );
  }

  if (anxiety.categories.length === 0) {
    return (
      <div className="rounded-2xl border-t-2 border-t-rose-300 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        {header}
        <p className="mt-3 text-xs leading-5 text-stone-400">还没有可用的焦虑归类。</p>
      </div>
    );
  }

  const total = anxiety.categories.reduce((s, c) => s + c.count, 0);
  const dim: Dim = {
    sampleSize: total,
    dist: sortDist(anxiety.categories.map((c) => [c.category, c.count] as [string, number])),
  };

  return (
    <div className="rounded-2xl border-t-2 border-t-rose-300 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="text-xs text-stone-500">最大的焦虑（LLM 归类）</p>
          {anxiety.asOf && (
            <span className="text-[10px] text-stone-400">截至 {anxiety.asOf}</span>
          )}
        </div>
        <div className="flex gap-0.5 rounded-lg bg-stone-100 p-0.5">
          {(['bar', 'pie'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                mode === m ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'
              }`}
            >
              {m === 'bar' ? '柱图' : '饼图'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'bar' ? (
        <div className="mt-3 space-y-2">
          {anxiety.categories.map((c, i) => {
            const pct = total ? Math.round((c.count / total) * 100) : 0;
            return (
              <div key={c.category}>
                <div className="flex justify-between text-xs text-stone-600">
                  <span className="truncate pr-2">{c.category}</span>
                  <span className="shrink-0 text-stone-400">{c.count} · {pct}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colorAt(i) }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <PieChart dim={dim} />
      )}
    </div>
  );
}

export function AudienceView() {
  const { data, loading, error } = useApi<AudienceResponse>('/api/mentor/audience');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;

  const d = data?.dimensions;

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs leading-5 text-stone-500">
        与分身有有效对话的用户共 {data?.totalQualified ?? 0} 人；以下分布只含该群体，样本少于 5 人的维度不展示。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DistributionCard title="当前状态" dim={d?.status} />
        <DistributionCard title="年龄段" dim={d?.ageBand} />
        <DistributionCard title="专业分类" dim={d?.major} />
        <DistributionCard title="感兴趣的职业方向" dim={d?.careers} labelMap={data?.careerLabels} />
        <DistributionCard title="最希望获得帮助的方面" dim={d?.helpPriority} />
        <DistributionCard title="最想和谁深聊" dim={d?.mentorPreference} />
        <DistributionCard title="霍兰德兴趣首型" dim={d?.riasecPrimary} labelMap={RIASEC_NAMES} />
        <DistributionCard title="霍兰德三位组合" dim={d?.riasecCombo} />
        <DistributionCard title="目前所在地" dim={d?.curProvince} />
        <DistributionCard title="希望工作地" dim={d?.workProvince} />
      </div>

      <AnxietyCard anxiety={data?.anxiety ?? { categories: [] }} />
    </div>
  );
}
