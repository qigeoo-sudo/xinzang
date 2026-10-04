'use client';

/** 页面：顶部停留/离开两张饼图 + 停留时长×离开率相关性散点；下方为每页双 bar 明细 */
import { useState } from 'react';
import { useAdminApi } from './use-admin-api';
import { ViewState } from '@/components/mentor-console/stat-card';

interface PageStat {
  path: string;
  label: string;
  views: number;
  uniqueVisitors: number;
  avgStaySec: number;
  exitCount: number;
  exitRate: number;
}

interface PagesResponse {
  dateRange: { start: string | null; end: string };
  pages: PageStat[];
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
}

// ---------- 环形饼图（自绘 SVG，<3% 的扇区合并为「其他」） ----------
const DONUT_COLORS = [
  '#c2410c', '#b45309', '#ca8a04', '#65a30d', '#0e7490',
  '#55734B', '#7c5c93', '#be185d', '#0369a1', '#9a3412', '#a16207',
];

interface DonutSlice { label: string; value: number; color: string }

function buildSlices(entries: { label: string; value: number }[]): DonutSlice[] {
  const total = entries.reduce((a, e) => a + e.value, 0) || 1;
  const major = entries.filter((e) => e.value / total >= 0.03);
  const rest = entries.filter((e) => e.value / total < 0.03);
  const slices: DonutSlice[] = major.map((e, i) => ({ ...e, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  const restVal = rest.reduce((a, e) => a + e.value, 0);
  if (restVal > 0) slices.push({ label: `其他（${rest.length} 页）`, value: restVal, color: '#b8b0a4' });
  return slices;
}

function arcPath(cx: number, cy: number, rOut: number, rIn: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(rOut, a0);
  const [x1, y1] = p(rOut, a1);
  const [x2, y2] = p(rIn, a1);
  const [x3, y3] = p(rIn, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0},${y0} A${rOut},${rOut} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 ${large} 0 ${x3},${y3} Z`;
}

function Donut({
  title,
  slices,
  centerMain,
  centerSub,
}: {
  title: string;
  slices: DonutSlice[];
  centerMain: string;
  centerSub: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const cx = 90, cy = 90, rOut = 74, rIn = 52;
  let acc = -Math.PI / 2;
  const geom = slices.map((s) => {
    const a0 = acc;
    const a1 = acc + (s.value / total) * Math.PI * 2;
    acc = a1;
    return { a0, a1, mid: (a0 + a1) / 2 };
  });

  return (
    <div className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <p className="text-xs font-semibold text-stone-600">{title}</p>
      <svg viewBox="0 0 180 180" className="mx-auto mt-1 w-full max-w-[200px]">
        {slices.map((s, i) => {
          const g = geom[i];
          const active = hover === i;
          const dx = active ? Math.cos(g.mid) * 4 : 0;
          const dy = active ? Math.sin(g.mid) * 4 : 0;
          return (
            <path
              key={s.label}
              d={arcPath(cx, cy, rOut, rIn, g.a0, g.a1)}
              fill={s.color}
              opacity={hover === null || active ? 1 : 0.45}
              transform={`translate(${dx},${dy})`}
              className="cursor-pointer transition-opacity"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-stone-800 text-[13px] font-semibold">
          {hover === null ? centerMain : `${((slices[hover].value / total) * 100).toFixed(1)}%`}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-stone-400 text-[9.5px]">
          {hover === null ? centerSub : slices[hover].label}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-x-2.5 gap-y-1">
        {slices.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-1 text-[11px] ${hover === i ? 'font-semibold text-stone-800' : 'text-stone-500'}`}
          >
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- 相关性 ----------
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  return vx && vy ? cov / Math.sqrt(vx * vy) : 0;
}
function corrWord(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.7) return '强相关';
  if (a >= 0.4) return '中等相关';
  if (a >= 0.2) return '弱相关';
  return '无明显相关';
}

// ---------- 散点图：x=平均停留，y=离开率，点大小=访问量；自动识别最大离群点 ----------
function StayExitScatter({ pages }: { pages: PageStat[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const xs = pages.map((p) => p.avgStaySec);
  const ys = pages.map((p) => p.exitRate);
  const rAll = pearson(xs, ys);

  // 全量 OLS，残差最大的点视为离群点；排除后重算 r
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0, vx = 0;
  for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; }
  const slope = vx ? cov / vx : 0;
  const intercept = my - slope * mx;
  let outlier = 0;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(ys[i] - (slope * xs[i] + intercept)) > Math.abs(ys[outlier] - (slope * xs[outlier] + intercept))) outlier = i;
  }
  const xs2 = xs.filter((_, i) => i !== outlier);
  const ys2 = ys.filter((_, i) => i !== outlier);
  const rExcl = pearson(xs2, ys2);

  // 画布与比例尺
  const W = 480, H = 260, pL = 42, pR = 14, pT = 12, pB = 34;
  const xMax = Math.ceil(Math.max(...xs) / 100) * 100;
  const yMax = (Math.ceil(Math.max(...ys) * 100 / 5) * 5) / 100;
  const sx = (v: number) => pL + (v / xMax) * (W - pL - pR);
  const sy = (v: number) => H - pB - (v / yMax) * (H - pT - pB);
  const pr = (views: number) => 5 + Math.sqrt(views) / 9;
  const xTicks = Array.from({ length: xMax / 100 + 1 }, (_, i) => i * 100);
  const yTicks = Array.from({ length: yMax / 0.05 + 1 }, (_, i) => i * 0.05).filter((v) => Math.round(v * 100) % 10 === 0);

  // 趋势线端点
  const linePts = [
    { x: sx(0), y: sy(Math.max(0, intercept)) },
    { x: sx(xMax), y: sy(slope * xMax + intercept) },
  ];
  // 常驻标注：离群点 + 访问量前二（其余悬停看）
  const top2 = [...pages].map((p, i) => ({ i, v: p.views })).sort((a, b) => b.v - a.v).slice(0, 2).map((o) => o.i);
  const pinned = new Set([outlier, ...top2]);

  return (
    <div className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <p className="text-xs font-semibold text-stone-600">停留时长 × 离开率相关性（点越大访问越多）</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full">
        {/* 网格与刻度 */}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} y1={pT} x2={sx(t)} y2={H - pB} stroke="#f0ece4" strokeWidth={1} />
            <text x={sx(t)} y={H - pB + 15} textAnchor="middle" className="fill-stone-400 text-[9.5px]">{t}</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pL} y1={sy(t)} x2={W - pR} y2={sy(t)} stroke="#f0ece4" strokeWidth={1} />
            <text x={pL - 5} y={sy(t) + 3} textAnchor="end" className="fill-stone-400 text-[9.5px]">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} stroke="#c9c0b2" />
        <line x1={pL} y1={pT} x2={pL} y2={H - pB} stroke="#c9c0b2" />
        <text x={(pL + W - pR) / 2} y={H - 4} textAnchor="middle" className="fill-stone-500 text-[10px]">
          平均停留（秒）
        </text>
        <text x={12} y={(pT + H - pB) / 2} textAnchor="middle" className="fill-stone-500 text-[10px]" transform={`rotate(-90 12 ${(pT + H - pB) / 2})`}>
          离开率
        </text>

        {/* 全量拟合趋势线 */}
        <line
          x1={linePts[0].x} y1={linePts[0].y} x2={linePts[1].x} y2={linePts[1].y}
          stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="5 4"
        />

        {/* 点 */}
        {pages.map((p, i) => {
          const isOut = i === outlier;
          const active = hover === i;
          return (
            <g key={p.path} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
              <circle
                cx={sx(p.avgStaySec)} cy={sy(p.exitRate)} r={pr(p.views) * (active ? 1.25 : 1)}
                fill={isOut ? '#c2410c' : '#55734B'}
                fillOpacity={hover === null || active ? 0.82 : 0.35}
                stroke="#fff" strokeWidth={1.5}
              />
              {(pinned.has(i) || active) && (
                <text
                  x={sx(p.avgStaySec)} y={sy(p.exitRate) - pr(p.views) - 4}
                  textAnchor="middle"
                  className="text-[9.5px] font-semibold"
                  fill={isOut ? '#c2410c' : '#44403c'}
                  style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}
                >
                  {p.label}
                </text>
              )}
              <title>{`${p.label}：平均 ${formatDuration(p.avgStaySec)} · 离开率 ${Math.round(p.exitRate * 100)}% · ${p.views.toLocaleString()} 次访问`}</title>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
        全部页面 r = <span className="font-semibold text-stone-700">{rAll.toFixed(2)}</span>（{corrWord(rAll)}）；
        排除「{pages[outlier].label}」后 r = <span className="font-semibold text-stone-700">{rExcl.toFixed(2)}</span>（{corrWord(rExcl)}）。
        整体正相关主要由 {pages[outlier].label} 单点主导——它是「用完即走」的满足型终点页，高停留与高离开同时成立，并不代表流失。
      </p>
    </div>
  );
}

export function PagesView() {
  const { data, loading, error } = useAdminApi<PagesResponse>('/api/admin/pages');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  // 明细固定按访问次数降序；次数/人数各取该列最大值独立归一化
  const pages = [...data.pages].sort((a, b) => b.views - a.views);
  const maxViews = Math.max(...pages.map((p) => p.views), 1);
  const maxUv = Math.max(...pages.map((p) => p.uniqueVisitors), 1);

  // 饼图口径：总停留时长（views×平均停留）、离开人次
  const stayEntries = pages.map((p) => ({ label: p.label, value: p.views * p.avgStaySec })).sort((a, b) => b.value - a.value);
  const exitEntries = pages.map((p) => ({ label: p.label, value: p.exitCount })).sort((a, b) => b.value - a.value);
  const staySlices = buildSlices(stayEntries);
  const exitSlices = buildSlices(exitEntries);
  const totalStaySec = stayEntries.reduce((a, e) => a + e.value, 0);
  const totalExit = exitEntries.reduce((a, e) => a + e.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">离开率 = 以该页结束访问的比例</p>
        <div className="flex items-center gap-3 text-[11px] text-stone-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#c2410c]" />
            次数
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#a16207]" />
            人数
          </span>
        </div>
      </div>

      {/* 顶部图表：停留饼图 + 离开饼图 + 相关性散点 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
        <Donut
          title="用户时间花在哪（总停留时长占比）"
          slices={staySlices}
          centerMain={`${Math.round(totalStaySec / 3600).toLocaleString()}`}
          centerSub="总停留小时"
        />
        <Donut
          title="用户最终从哪离开（离开人次占比）"
          slices={exitSlices}
          centerMain={totalExit.toLocaleString()}
          centerSub="总离开人次"
        />
        <StayExitScatter pages={pages} />
      </div>

      <div className="space-y-2">
        {pages.map((p) => (
          <div
            key={p.path}
            className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-800">{p.label}</p>
              <p className="font-mono text-[11px] text-stone-400">{p.path}</p>
            </div>

            {/* 访问次数条（橙） */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-[#c2410c]"
                  style={{ width: `${Math.max((p.views / maxViews) * 100, 2)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs text-stone-600">
                {p.views.toLocaleString()} 次
              </span>
            </div>

            {/* 独立访客条（赭石褐） */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-[#a16207]"
                  style={{ width: `${Math.max((p.uniqueVisitors / maxUv) * 100, 2)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs text-stone-600">
                {p.uniqueVisitors.toLocaleString()} 人
              </span>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs text-stone-500">
              <span>平均停留 {formatDuration(p.avgStaySec)}</span>
              <span>
                离开率{' '}
                <span className={p.exitRate >= 0.2 ? 'font-semibold text-[#C9563F]' : ''}>
                  {Math.round(p.exitRate * 100)}%
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
