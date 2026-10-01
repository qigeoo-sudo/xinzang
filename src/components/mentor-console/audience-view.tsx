'use client';

/** 用户画像：仅展示与分身有有效对话用户的聚合分布；样本 <5 屏蔽
 *  状态/年龄固定顺序；专业/职业方向 Top 10 加注；焦虑为 LLM 归类文本框
 *  每张卡支持柱状图/饼图切换；类别统一配色
 *  所有统计图默认饼图。
 *  「付费权益」勾选（默认勾选）：
 *  - 柱图：柱身减淡为浅色，付费段用原色标在柱根，右侧数字旁加付费人数及付费占比
 *  - 饼图：勾选时只展示付费用户分布；不勾选展示全量统计（饼块始终原色）
 *  「渠道来源」卡：网站/导师/其他；默认饼图，可切柱图；勾选付费用原色（付费分布），
 *  不勾选用浅色（全量分布）；饼图导师块内虚线划出「来自您」区域并折线标注 */
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
  paidTotalQualified?: number;
  dimensions: Record<string, Dim>;
  paidDimensions?: Record<string, Dim>;
  careerLabels: Record<string, string>;
  anxiety: {
    categories: { category: string; count: number }[];
    asOf?: string;
    unavailable?: boolean;
    sourceCount?: number;
  };
  paidAnxiety?: {
    categories: { category: string; count: number }[];
    asOf?: string;
    sourceCount?: number;
  };
  channels?: { all: ChannelSplit; paid: ChannelSplit };
}

interface ChannelSplit {
  website: number;
  mentor: number;
  other: number;
  /** 导师来源中来自本分身的占比 */
  mentorOwn: number;
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

/** 减淡颜色（免费/全量视图；饼块与柱身用同一浅度） */
function lighten(hex: string, amt = 0.55): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amt);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt);
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt);
  return `rgb(${r}, ${g}, ${b})`;
}

/** "其他"永远排最后 */
function sortDist(entries: [string, number][]): [string, number][] {
  const other = entries.filter(([k]) => k === '其他');
  const rest = entries.filter(([k]) => k !== '其他').sort((a, b) => b[1] - a[1]);
  return [...rest, ...other];
}

/** 从付费 dim 里按类别名取付费人数 */
function paidLookup(paidDim?: Dim): Map<string, number> | null {
  if (!paidDim || paidDim.suppressed || !paidDim.dist) return null;
  return new Map(paidDim.dist.map(([k, v]) => [k, v]));
}

function DistributionCard({
  title,
  dim,
  paidDim,
  showPaid,
  labelMap,
}: {
  title: string;
  dim?: Dim;
  paidDim?: Dim;
  showPaid: boolean;
  labelMap?: Record<string, string>;
}) {
  const [mode, setMode] = useState<'bar' | 'pie'>('pie');
  const paidMap = showPaid ? paidLookup(paidDim) : null;
  // 饼图勾选付费时：只显示付费用户分布（原色）；全量视图饼块减淡
  const paidPieActive = !!(showPaid && paidDim && !paidDim.suppressed && paidDim.dist?.length);
  const pieDim = paidPieActive && paidDim ? paidDim : dim;
  const paidPieUnavailable = showPaid && mode === 'pie' && (!paidDim || !!paidDim.suppressed);

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
      ) : paidPieUnavailable ? (
        <p className="mt-3 text-xs leading-5 text-stone-400">付费用户样本不足 5 人，暂不展示。</p>
      ) : mode === 'bar' ? (
        <div className="mt-3 space-y-2">
          {dim.dist?.map(([label, n], i) => {
            const pct = dim.sampleSize ? Math.round((n / dim.sampleSize) * 100) : 0;
            const paidN = paidMap?.get(label);
            // 付费段宽度以全量样本为分母，与全量柱可比；付费占比以付费样本为分母
            const paidPctAll = paidN && dim.sampleSize ? (paidN / dim.sampleSize) * 100 : 0;
            const paidPctOwn = paidN && paidDim?.sampleSize ? Math.round((paidN / paidDim.sampleSize) * 100) : 0;
            const display = labelMap?.[label] ?? label;
            return (
              <div key={label}>
                <div className="flex justify-between text-xs text-stone-600">
                  <span className="truncate pr-2">{display}</span>
                  <span className="shrink-0">
                    {paidN !== undefined && (
                      <span className="mr-1.5 font-semibold text-stone-800">
                        {paidN}{paidPctOwn ? ` · ${paidPctOwn}%` : ''}
                      </span>
                    )}
                    <span className="text-stone-400">{n} · {pct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="relative h-full rounded-full" style={{ width: `${pct}%` }}>
                    <div className="absolute inset-0 rounded-full" style={{ backgroundColor: lighten(colorAt(i)) }} />
                    {paidN !== undefined && paidPctAll > 0 && (
                      <div
                        className="absolute left-0 top-0 h-full"
                        style={{ width: `${paidPctAll}%`, backgroundColor: colorAt(i) }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <PieChart dim={pieDim ?? dim} labelMap={labelMap} />
      )}
    </div>
  );
}

/** 简易 SVG 饼图 — 大直径，标签靠右；饼块始终原色 */
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

/** 焦虑归类卡：柱/饼切换；付费勾选时柱根加深色段、饼图只看付费 */
function AnxietyCard({
  anxiety,
  paidAnxiety,
  showPaid,
}: {
  anxiety: AudienceResponse['anxiety'];
  paidAnxiety?: AudienceResponse['paidAnxiety'];
  showPaid: boolean;
}) {
  const [mode, setMode] = useState<'bar' | 'pie'>('pie');

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
  const paidMap =
    showPaid && paidAnxiety?.categories.length
      ? new Map(paidAnxiety.categories.map((c) => [c.category, c.count]))
      : null;
  const paidTotal = paidAnxiety?.categories.reduce((s, c) => s + c.count, 0) ?? 0;
  const paidDim: Dim | null = paidAnxiety?.categories.length
    ? {
        sampleSize: paidTotal,
        dist: sortDist(paidAnxiety.categories.map((c) => [c.category, c.count] as [string, number])),
      }
    : null;

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
            const paidN = paidMap?.get(c.category);
            const paidPctAll = paidN ? (paidN / total) * 100 : 0;
            const paidPctOwn = paidN && paidTotal ? Math.round((paidN / paidTotal) * 100) : 0;
            return (
              <div key={c.category}>
                <div className="flex justify-between text-xs text-stone-600">
                  <span className="truncate pr-2">{c.category}</span>
                  <span className="shrink-0">
                    {paidN !== undefined && (
                      <span className="mr-1.5 font-semibold text-stone-800">
                        {paidN}{paidPctOwn ? ` · ${paidPctOwn}%` : ''}
                      </span>
                    )}
                    <span className="text-stone-400">{c.count} · {pct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="relative h-full rounded-full" style={{ width: `${pct}%` }}>
                    <div className="absolute inset-0 rounded-full" style={{ backgroundColor: lighten(colorAt(i)) }} />
                    {paidN !== undefined && paidPctAll > 0 && (
                      <div
                        className="absolute left-0 top-0 h-full"
                        style={{ width: `${paidPctAll}%`, backgroundColor: colorAt(i) }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : showPaid && paidDim ? (
        <PieChart dim={paidDim} />
      ) : (
        <PieChart dim={dim} />
      )}
    </div>
  );
}

/** 渠道来源饼图：勾选付费块原色、不勾选浅色；导师块内虚线划出「来自您」区域并折线标注 */
function ChannelPie({
  rows,
  cur,
  denom,
  showPaid,
}: {
  rows: { label: string; pct: number }[];
  cur: ChannelSplit;
  denom: number;
  showPaid: boolean;
}) {
  const R = 110;
  const CX = 150;
  const CY = 140;
  const ownPct = cur.mentorOwn ?? 0;
  let angle = -Math.PI / 2;

  const slices = rows.map((r, i) => {
    const startAngle = angle;
    const endAngle = angle + (r.pct / 100) * 2 * Math.PI;
    angle = endAngle;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const largeArc = r.pct / 100 > 0.5 ? 1 : 0;
    return {
      label: r.label,
      pct: r.pct,
      n: denom ? Math.round((denom * r.pct) / 100) : 0,
      startAngle,
      endAngle,
      path: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: showPaid ? colorAt(i) : lighten(colorAt(i)),
    };
  });

  // 导师块内「来自您」区域：占导师块的 ownFrac 比例，从导师块起始边划起
  const mentor = slices.find((s) => s.label === '导师');
  const ownFrac = mentor && mentor.pct > 0 ? Math.min(1, ownPct / mentor.pct) : 0;
  const boundary = mentor ? mentor.startAngle + ownFrac * (mentor.endAngle - mentor.startAngle) : 0;
  const dashEnd = { x: CX + R * Math.cos(boundary), y: CY + R * Math.sin(boundary) };
  // 折线：从「来自您」区域弧中点引出到块外
  const mid = mentor ? mentor.startAngle + (ownFrac / 2) * (mentor.endAngle - mentor.startAngle) : 0;
  const goingLeft = Math.cos(mid) < 0;
  const p2 = { x: CX + (R + 14) * Math.cos(mid), y: CY + (R + 14) * Math.sin(mid) };
  const p3 = { x: p2.x + (goingLeft ? -22 : 22), y: p2.y };
  const labelX = p3.x + (goingLeft ? -4 : 4);

  return (
    <div className="mt-3 flex items-center gap-3">
      <svg width={400} height={247} viewBox="-80 -10 470 290" className="shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={1.5} />
        ))}
        {mentor && ownFrac > 0 && (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={dashEnd.x}
              y2={dashEnd.y}
              stroke="#ffffff"
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
            <polyline
              points={`${CX + R * 0.6 * Math.cos(mid)},${CY + R * 0.6 * Math.sin(mid)} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
              fill="none"
              stroke="#be123c"
              strokeWidth={1.2}
            />
            <text x={labelX} y={p3.y + 3} textAnchor={goingLeft ? 'end' : 'start'} fontSize={11} fill="#be123c">
              来自您 {ownPct}%
            </text>
          </>
        )}
      </svg>
      <div className="flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] text-stone-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="shrink-0 text-stone-400">{s.n} · {s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 渠道来源卡：网站/导师/其他
 *  默认饼图，可切柱图；勾选付费显示付费分布（原色），不勾选显示全量（浅色）
 *  柱图与其他柱状图一致：全量浅柱，勾选付费时叠加付费深色段；不显示导师贡献
 *  饼图导师块内白色虚线划出「来自您」区域，深红折线引出标注；图例只列三来源 */
function ChannelsCard({
  channels,
  totalAll,
  totalPaid,
  showPaid,
}: {
  channels?: AudienceResponse['channels'];
  totalAll: number;
  totalPaid: number;
  showPaid: boolean;
}) {
  const [mode, setMode] = useState<'bar' | 'pie'>('pie');
  if (!channels) return null;
  const cur = showPaid ? channels.paid : channels.all;
  const denom = showPaid ? totalPaid : totalAll;
  const rows: { key: 'website' | 'mentor' | 'other'; label: string }[] = [
    { key: 'website', label: '网站' },
    { key: 'mentor', label: '导师' },
    { key: 'other', label: '其他' },
  ];

  return (
    <div className="rounded-2xl border-t-2 border-t-sky-300 bg-gradient-to-br from-sky-50 to-cyan-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">渠道来源</p>
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
          {rows.map((r, i) => {
            // 与其他柱状图一致：柱 = 全量占比（浅色），付费段 = 该来源付费人数（原色深）
            const allPct = channels.all?.[r.key] ?? 0;
            const allN = totalAll ? Math.round((totalAll * allPct) / 100) : 0;
            const paidPctOwn = channels.paid?.[r.key] ?? 0;
            const paidN = totalPaid ? Math.round((totalPaid * paidPctOwn) / 100) : 0;
            const paidPctAll = totalAll ? (paidN / totalAll) * 100 : 0;
            // 段宽相对柱身折算；mock 两组占比独立给出，超出柱宽时收在柱内
            const segW = allPct ? Math.min(100, (paidPctAll / allPct) * 100) : 0;
            const color = colorAt(i);
            return (
              <div key={r.key}>
                <div className="flex justify-between text-xs text-stone-600">
                  <span>{r.label}</span>
                  <span className="shrink-0">
                    {showPaid && paidN > 0 && (
                      <span className="mr-1.5 font-semibold text-stone-800">
                        {paidN}{paidPctOwn ? ` · ${paidPctOwn}%` : ''}
                      </span>
                    )}
                    <span className="text-stone-400">{allN} · {allPct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="relative h-full rounded-full" style={{ width: `${allPct}%` }}>
                    <div className="absolute inset-0 rounded-full" style={{ backgroundColor: lighten(color) }} />
                    {showPaid && segW > 0 && (
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{ width: `${segW}%`, backgroundColor: color }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ChannelPie
          rows={rows.map((r) => ({ label: r.label, pct: cur?.[r.key] ?? 0 }))}
          cur={cur}
          denom={denom}
          showPaid={showPaid}
        />
      )}
    </div>
  );
}

export function AudienceView() {
  const { data, loading, error } = useApi<AudienceResponse>('/api/mentor/audience');
  const [showPaid, setShowPaid] = useState(true);

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;

  const d = data?.dimensions;
  const pd = data?.paidDimensions;

  return (
    <div className="space-y-4">
      {/* 说明行 + 付费权益勾选（右侧） */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs leading-5 text-stone-500">
          与分身有有效对话的用户共 {data?.totalQualified ?? 0} 人
          {showPaid && data?.paidTotalQualified != null && (
            <>，其中付费 <b className="text-stone-700">{data.paidTotalQualified}</b> 人（柱根重色段）</>
          )}
          ；样本少于 5 人的维度不展示。
        </p>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-stone-600">
          <input
            type="checkbox"
            checked={showPaid}
            onChange={(e) => setShowPaid(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#55734B]"
          />
          付费权益
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DistributionCard title="当前状态" dim={d?.status} paidDim={pd?.status} showPaid={showPaid} />
        <DistributionCard title="年龄段" dim={d?.ageBand} paidDim={pd?.ageBand} showPaid={showPaid} />
        <DistributionCard title="专业分类" dim={d?.major} paidDim={pd?.major} showPaid={showPaid} />
        <DistributionCard title="感兴趣的职业方向" dim={d?.careers} paidDim={pd?.careers} showPaid={showPaid} labelMap={data?.careerLabels} />
        <DistributionCard title="最希望获得帮助的方面" dim={d?.helpPriority} paidDim={pd?.helpPriority} showPaid={showPaid} />
        <DistributionCard title="最想和谁深聊" dim={d?.mentorPreference} paidDim={pd?.mentorPreference} showPaid={showPaid} />
        <DistributionCard title="霍兰德兴趣首型" dim={d?.riasecPrimary} paidDim={pd?.riasecPrimary} showPaid={showPaid} labelMap={RIASEC_NAMES} />
        <DistributionCard title="霍兰德三位组合" dim={d?.riasecCombo} paidDim={pd?.riasecCombo} showPaid={showPaid} />
        <DistributionCard title="目前所在地" dim={d?.curProvince} paidDim={pd?.curProvince} showPaid={showPaid} />
        <DistributionCard title="希望工作地" dim={d?.workProvince} paidDim={pd?.workProvince} showPaid={showPaid} />
      </div>

      <AnxietyCard
        anxiety={data?.anxiety ?? { categories: [] }}
        paidAnxiety={data?.paidAnxiety}
        showPaid={showPaid}
      />

      <ChannelsCard
        channels={data?.channels}
        totalAll={data?.totalQualified ?? 0}
        totalPaid={data?.paidTotalQualified ?? 0}
        showPaid={showPaid}
      />
    </div>
  );
}
