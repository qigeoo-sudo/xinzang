'use client';

/**
 * 手写 SVG 趋势图：柱状 / 折线。
 * 固定 60 天，自适应容器宽度不滚动；超过 60 天才拉滚动条。
 * 悬停显示日期+数值；折线指标支持周均/月均/总均线切换。
 */
import { useState, useMemo, useRef, useEffect, type MouseEvent } from 'react';

interface DayRow {
  date: string;
  [key: string]: number | string;
}

interface MetricDef {
  key: string;
  label: string;
  kind: 'bar' | 'line';
  unit?: string;
  stackKeys?: string[];
  scaleGroup?: string;
  cumulative?: boolean;
}

type ColorMode = 'uniform' | 'byCategory';

const PALETTE = [
  '#55734B', '#C96F2A', '#8B6F47', '#6B8E23', '#B8860B',
  '#708090', '#9B8B4E', '#A0522D', '#5F9EA0', '#BC8F5F',
  '#778899', '#6B7B5F', '#8B4513', '#2F6B4F', '#CD853F',
];

const STACK_LABELS: Record<string, string> = {
  free_trial_rounds: '免费',
  billed_rounds: '计费',
};

const HEIGHT = 200;
const PAD_TOP = 14;
const PAD_BOTTOM = 28;
const PAD_LEFT = 32;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

function calcYAxis(dataMax: number): { step: number; ticks: number[]; niceMax: number } {
  if (dataMax <= 0) return { step: 5, ticks: [0, 5], niceMax: 5 };
  let step = 5;
  while (Math.ceil(dataMax / step) > 5) step += 5;
  const count = Math.ceil(dataMax / step);
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(i * step);
  return { step, ticks, niceMax: count * step };
}

/* ---------- 柱状图 ---------- */
function BarChart({
  days,
  metric,
  colorMode,
  niceMaxOverride,
  slot,
  width,
}: {
  days: DayRow[];
  metric: MetricDef;
  colorMode: ColorMode;
  niceMaxOverride?: number;
  slot: number;
  width: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const isStacked = !!metric.stackKeys?.length;
  const stackKeys = metric.stackKeys ?? [];

  const values = days.map((d) => {
    if (isStacked) {
      return stackKeys.reduce((sum, k) => sum + Number(d[k] ?? 0), 0);
    }
    return Number(d[metric.key] ?? 0);
  });

  const dataMax = Math.max(...values, 1);
  const { ticks, niceMax: ownMax } = calcYAxis(dataMax);
  const niceMax = niceMaxOverride ?? ownMax;

  const xPos = (i: number) => i * slot + slot / 2 + PAD_LEFT;
  const yPos = (v: number) => PAD_TOP + PLOT_H - (v / niceMax) * PLOT_H;

  const step = Math.max(1, Math.ceil(days.length / 6));
  const labels = days
    .map((d, i) => (i % step === 0 ? { i, label: d.date.slice(5) } : null))
    .filter((v): v is { i: number; label: string } => v !== null);

  const segColor = (sk: string, i: number) => {
    if (colorMode === 'byCategory') return PALETTE[i % PALETTE.length];
    return sk === 'free_trial_rounds' ? '#8BAE7A' : '#55734B';
  };
  const segOpacity = (sk: string) => {
    if (colorMode === 'byCategory') return sk === 'free_trial_rounds' ? 0.4 : 0.9;
    return 0.85;
  };

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={`${metric.label}柱状图`}>
      {ticks.map((t) => {
        const y = PAD_TOP + PLOT_H - (t / niceMax) * PLOT_H;
        return (
          <g key={t}>
            <line x1={PAD_LEFT - 2} y1={y} x2={width} y2={y} stroke={t === 0 ? '#D6D3D1' : '#F5F5F4'} />
            <text x={PAD_LEFT - 6} y={y + 3} fontSize={9} fill="#A8A29E" textAnchor="end">{t}</text>
          </g>
        );
      })}
      <text x={2} y={PAD_TOP + 4} fontSize={9} fill="#A8A29E">{metric.unit ?? '次'}</text>

      {/* 堆叠柱 */}
      {isStacked
        ? values.map((total, i) => {
            if (total === 0) return null;
            let acc = 0;
            const segs = stackKeys.map((sk) => {
              const v = Number(days[i][sk] ?? 0);
              const seg = { v, y: yPos(acc + v), h: (v / niceMax) * PLOT_H, color: segColor(sk, i), opacity: segOpacity(sk), label: STACK_LABELS[sk] ?? sk };
              acc += v;
              return seg;
            });
            return (
              <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                {segs.map((s, si) => (
                  <rect key={si} x={i * slot + PAD_LEFT + 2} y={s.y} width={slot - 4} height={Math.max(s.v > 0 ? 2 : 0, s.h)} rx={si === segs.length - 1 ? 2 : 0} fill={s.color} opacity={s.opacity}>
                    <title>{`${days[i].date} · ${s.label} ${s.v} 次`}</title>
                  </rect>
                ))}
                <text x={xPos(i)} y={yPos(total) - 3} fontSize={9} fill="#78716C" textAnchor="middle" fontWeight={600}>{total}</text>
              </g>
            );
          })
        : values.map((v, i) => {
            if (v === 0) return null;
            const h = (v / niceMax) * PLOT_H;
            const fill = colorMode === 'byCategory' ? PALETTE[i % PALETTE.length] : '#55734B';
            return (
              <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                <rect x={i * slot + PAD_LEFT + 2} y={yPos(v)} width={slot - 4} height={Math.max(2, h)} rx={2} fill={fill} opacity={0.85}>
                  <title>{`${days[i].date} · ${metric.label} ${v} ${metric.unit ?? '次'}`}</title>
                </rect>
                <text x={xPos(i)} y={yPos(v) - 3} fontSize={9} fill="#78716C" textAnchor="middle" fontWeight={600}>{v}</text>
              </g>
            );
          })}

      {/* 堆叠图例 */}
      {isStacked && (
        <g>
          {stackKeys.map((sk, si) => (
            <g key={sk}>
              <rect x={width - 70} y={PAD_TOP + si * 14} width={8} height={8} rx={1} fill={colorMode === 'byCategory' ? '#55734B' : segColor(sk, 0)} opacity={segOpacity(sk)} />
              <text x={width - 58} y={PAD_TOP + si * 14 + 7} fontSize={9} fill="#78716C">{STACK_LABELS[sk] ?? sk}</text>
            </g>
          ))}
        </g>
      )}

      {labels.map((l, li) => (
        <text key={l.i} x={xPos(l.i)} y={li % 2 === 0 ? HEIGHT - 16 : HEIGHT - 4} fontSize={9} fill="#A8A29E" textAnchor="middle">{l.label}</text>
      ))}

      {/* 悬停浮窗：日期 + 数值 */}
      {hovered !== null && days[hovered] && (
        (() => {
          const v = isStacked ? stackKeys.reduce((s, k) => s + Number(days[hovered][k] ?? 0), 0) : Number(days[hovered][metric.key] ?? 0);
          if (v === 0) return null;
          const label = `${days[hovered].date.slice(5)} · ${v} ${metric.unit ?? '次'}`;
          const tx = xPos(hovered);
          const ty = Math.max(PAD_TOP + 6, yPos(v) - 14);
          const labelW = label.length * 6 + 12;
          return (
            <g pointerEvents="none">
              <rect x={tx - labelW / 2} y={ty - 11} width={labelW} height={15} rx={3} fill="#44403C" opacity={0.92} />
              <text x={tx} y={ty} fontSize={9} fill="#fff" textAnchor="middle" fontWeight={500}>
                {label}
              </text>
            </g>
          );
        })()
      )}
    </svg>
  );
}

/* ---------- 折线图 ---------- */
function LineChart({
  days,
  metric,
  slot,
  width,
  showMA,
}: {
  days: DayRow[];
  metric: MetricDef;
  slot: number;
  width: number;
  showMA: { weekly: boolean; monthly: boolean; total: boolean };
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const values = days.map((d) => Number(d[metric.key] ?? 0));
  const dataMax = Math.max(...values, 1);
  const { ticks, niceMax } = calcYAxis(dataMax);

  const xPos = (i: number) => i * slot + slot / 2 + PAD_LEFT;
  const yPos = (v: number) => PAD_TOP + PLOT_H - (v / niceMax) * PLOT_H;

  const step = Math.max(1, Math.ceil(days.length / 6));
  const labels = days
    .map((d, i) => (i % step === 0 ? { i, label: d.date.slice(5) } : null))
    .filter((v): v is { i: number; label: string } => v !== null);

  const points = values.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
  const unit = metric.unit ?? (metric.kind === 'line' ? '人' : '次');

  // 累计指标：均线基于「日增量」而非累计值本身
  const isCumulative = !!metric.cumulative;
  const incSeries = isCumulative
    ? values.map((v, i) => (i === 0 ? 0 : v - values[i - 1]))
    : values;

  const sma = (window: number) =>
    incSeries.map((_, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = incSeries.slice(start, i + 1);
      return slice.reduce((s, v) => s + v, 0) / slice.length;
    });
  const weekly = sma(7);
  const monthly = sma(30);
  const totalAvg = incSeries.length
    ? incSeries.reduce((s, v) => s + v, 0) / incSeries.length
    : 0;

  // 副 Y 轴（仅累计指标）：均线量级与累计值不同，需独立刻度
  const maMax = Math.max(...weekly, ...monthly, totalAvg, 1);
  const { ticks: maTicks, niceMax: maNiceMax } = calcYAxis(maMax);
  const PAD_RIGHT = 36;
  const maYPos = (v: number) => PAD_TOP + PLOT_H - (v / maNiceMax) * PLOT_H;
  const toPointsMA = (arr: number[]) =>
    arr.map((v, i) => `${xPos(i)},${maYPos(v)}`).join(' ');

  const handleMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x - slot / 2 - PAD_LEFT) / slot);
    setHoverIdx(idx >= 0 && idx < days.length ? idx : null);
  };

  const plotRight = isCumulative ? width - PAD_RIGHT : width;
  const maUnit = `${unit}/日`;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={`${metric.label}折线图`}>
      {ticks.map((t) => {
        const y = PAD_TOP + PLOT_H - (t / niceMax) * PLOT_H;
        return (
          <g key={t}>
            <line x1={PAD_LEFT - 2} y1={y} x2={plotRight} y2={y} stroke={t === 0 ? '#D6D3D1' : '#F5F5F4'} />
            <text x={PAD_LEFT - 6} y={y + 3} fontSize={9} fill="#A8A29E" textAnchor="end">{t}</text>
          </g>
        );
      })}
      <text x={2} y={PAD_TOP + 4} fontSize={9} fill="#A8A29E">{unit}</text>

      {/* 右侧副 Y 轴（累计指标的日均增量刻度） */}
      {isCumulative && (
        <g>
          {maTicks.map((t) => {
            const y = maYPos(t);
            return (
              <g key={`ma-${t}`}>
                <text x={width - 4} y={y + 3} fontSize={8} fill="#94A3B8" textAnchor="end">{t}</text>
              </g>
            );
          })}
          <text x={width - 2} y={PAD_TOP + 4} fontSize={8} fill="#94A3B8" textAnchor="end">{maUnit}</text>
        </g>
      )}

      {/* 总均线：日均增量的全程均值（水平虚线，副轴） */}
      {showMA.total && values.length > 0 && (
        <g>
          <line x1={PAD_LEFT} y1={maYPos(totalAvg)} x2={plotRight} y2={maYPos(totalAvg)} stroke="#6366F1" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={plotRight - 4} y={maYPos(totalAvg) - 3} fontSize={8} fill="#6366F1" textAnchor="end" fontWeight={600}>总均 {totalAvg.toFixed(2)}</text>
        </g>
      )}

      {/* 月均线：近30日日均增量（副轴） */}
      {showMA.monthly && (
        <polyline points={toPointsMA(monthly)} fill="none" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" opacity={0.9} />
      )}
      {/* 周均线：近7日日均增量（副轴） */}
      {showMA.weekly && (
        <polyline points={toPointsMA(weekly)} fill="none" stroke="#10B981" strokeWidth={2} strokeDasharray="4 2" opacity={0.9} />
      )}

      {/* 主线 */}
      <polyline points={points} fill="none" stroke="#C96F2A" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={xPos(i)} cy={yPos(v)} r={hoverIdx === i ? 4 : 2.4} fill="#C96F2A">
          <title>{`${days[i].date} · ${metric.label} ${v} ${unit}`}</title>
        </circle>
      ))}

      {labels.map((l, li) => (
        <text key={l.i} x={xPos(l.i)} y={li % 2 === 0 ? HEIGHT - 16 : HEIGHT - 4} fontSize={9} fill="#A8A29E" textAnchor="middle">{l.label}</text>
      ))}

      {/* 鼠标跟踪层 */}
      <rect
        x={PAD_LEFT} y={PAD_TOP} width={plotRight - PAD_LEFT} height={PLOT_H}
        fill="transparent"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      />

      {/* hover 浮窗：日期 + 数值 */}
      {hoverIdx !== null && days[hoverIdx] && (
        (() => {
          const v = values[hoverIdx];
          const cx = xPos(hoverIdx);
          const cy = yPos(v);
          const label = `${days[hoverIdx].date.slice(5)} · ${v} ${unit}`;
          const tw = label.length * 6 + 12;
          const tx = Math.min(Math.max(cx, PAD_LEFT + tw / 2 + 2), plotRight - tw / 2 - 2);
          const ty = Math.max(PAD_TOP + 12, cy - 18);
          return (
            <g pointerEvents="none">
              <line x1={cx} y1={PAD_TOP} x2={cx} y2={PAD_TOP + PLOT_H} stroke="#D6D3D1" strokeWidth={1} strokeDasharray="2 2" />
              <circle cx={cx} cy={cy} r={4} fill="#C96F2A" stroke="#fff" strokeWidth={1.5} />
              <rect x={tx - tw / 2} y={ty - 12} width={tw} height={16} rx={3} fill="#44403C" opacity={0.92} />
              <text x={tx} y={ty} fontSize={9} fill="#fff" textAnchor="middle" fontWeight={500}>{label}</text>
            </g>
          );
        })()
      )}
    </svg>
  );
}

/* ---------- 主组件 ---------- */
export function TrendChart({
  days,
  metrics,
  activeKey,
  onSelect,
}: {
  days: DayRow[];
  metrics: MetricDef[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [colorMode, setColorMode] = useState<ColorMode>('uniform');
  const [showMA, setShowMA] = useState({ weekly: false, monthly: false, total: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const active = metrics.find((m) => m.key === activeKey) ?? metrics[0];

  const groupNiceMax = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of metrics) {
      if (!m.scaleGroup) continue;
      const vals = days.map((d) => {
        if (m.stackKeys?.length) return m.stackKeys.reduce((s, k) => s + Number(d[k] ?? 0), 0);
        return Number(d[m.key] ?? 0);
      });
      const mx = Math.max(...vals, 1);
      const { niceMax } = calcYAxis(mx);
      if (!map[m.scaleGroup] || niceMax > map[m.scaleGroup]) map[m.scaleGroup] = niceMax;
    }
    return map;
  }, [days, metrics]);

  // 自适应宽度：≤60 天撑满容器，>60 天固定 slot 滚动
  const numDays = days.length;
  const isOverflow = numDays > 60;
  const hasSecondaryAxis = active.kind === 'line' && active.cumulative;
  const PAD_RIGHT = hasSecondaryAxis ? 36 : 0;
  const slot = isOverflow ? 14 : Math.max(6, (containerW - PAD_LEFT - PAD_RIGHT - 4) / numDays);
  const width = numDays * slot + PAD_LEFT + PAD_RIGHT;

  const isLineMetric = active.kind === 'line';
  const effectiveType = isLineMetric ? 'line' : chartType;
  const sharedMax = active.scaleGroup ? groupNiceMax[active.scaleGroup] : undefined;

  return (
    <div className="rounded-2xl border-t-2 border-t-sky-300 bg-gradient-to-br from-sky-50 to-cyan-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <div className="flex flex-wrap gap-1.5">
        {metrics.map((m) => (
          <button
            key={m.key}
            onClick={() => onSelect(m.key)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              m.key === active.key
                ? 'bg-[#55734B] text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="flex gap-1">
          {([
            { type: 'bar' as const, label: '柱状' },
            { type: 'line' as const, label: '折线' },
          ]).map((opt) => (
            <button
              key={opt.type}
              onClick={() => setChartType(opt.type)}
              disabled={isLineMetric}
              className={`rounded-md px-2.5 py-0.5 text-[11px] transition-colors ${
                effectiveType === opt.type
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              } ${isLineMetric ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {effectiveType === 'bar' && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-transparent">配色</span>
            {([
              { mode: 'uniform' as const, label: '统一色' },
              { mode: 'byCategory' as const, label: '类别色' },
            ]).map((opt) => (
              <button
                key={opt.mode}
                onClick={() => setColorMode(opt.mode)}
                className={`rounded-md px-2 py-0.5 text-[10px] transition-colors ${
                  colorMode === opt.mode
                    ? 'bg-stone-700 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* 均线开关：仅折线指标 */}
        {effectiveType === 'line' && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-stone-400">均线</span>
            {([
              { key: 'weekly' as const, label: '周均', color: '#10B981' },
              { key: 'monthly' as const, label: '月均', color: '#F59E0B' },
              { key: 'total' as const, label: '总均', color: '#6366F1' },
            ]).map((opt) => (
              <label key={opt.key} className="flex cursor-pointer items-center gap-1 text-[11px] text-stone-600">
                <input
                  type="checkbox"
                  checked={showMA[opt.key]}
                  onChange={() => setShowMA((s) => ({ ...s, [opt.key]: !s[opt.key] }))}
                  className="h-3 w-3 accent-stone-700"
                />
                <span style={{ color: opt.color }}>{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 图表区域：≤60 天撑满，>60 天滚动 */}
      <div ref={containerRef} className="mt-3" style={{ overflowX: isOverflow ? 'auto' : 'hidden' }}>
        {effectiveType === 'bar' ? (
          <BarChart days={days} metric={active} colorMode={colorMode} niceMaxOverride={sharedMax} slot={slot} width={width} />
        ) : (
          <LineChart days={days} metric={active} slot={slot} width={width} showMA={showMA} />
        )}
      </div>

      {/* 均线公式说明（累计指标） */}
      {active.cumulative && (showMA.weekly || showMA.monthly || showMA.total) && (
        <p className="mt-2 text-[10px] leading-4 text-stone-400">
          均线基于<b className="text-stone-500">日增量</b>计算：周均 = 近7日日均新增，月均 = 近30日日均新增，总均 = 全程日均新增（右侧副轴刻度）
        </p>
      )}
    </div>
  );
}
