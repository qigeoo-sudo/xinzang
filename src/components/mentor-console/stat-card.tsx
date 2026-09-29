'use client';

/** 统计卡：标签 + 主值 + 可选副文案；数值与文案都由父级统一传入 */
type Tone = 'green' | 'sky' | 'indigo' | 'amber' | 'rose' | 'violet' | 'stone';
const TONE_BG: Record<Tone, string> = {
  green: 'bg-gradient-to-br from-emerald-50 to-teal-50',
  sky: 'bg-gradient-to-br from-sky-50 to-cyan-50',
  indigo: 'bg-gradient-to-br from-indigo-50 to-violet-50',
  amber: 'bg-gradient-to-br from-amber-50 to-orange-50',
  rose: 'bg-gradient-to-br from-rose-50 to-pink-50',
  violet: 'bg-gradient-to-br from-violet-100 to-purple-100',
  stone: 'bg-gradient-to-br from-stone-50 to-stone-100',
};
const TONE_ACCENT: Record<Tone, string> = {
  green: 'border-t-emerald-300',
  sky: 'border-t-sky-300',
  indigo: 'border-t-indigo-300',
  amber: 'border-t-amber-300',
  rose: 'border-t-rose-300',
  violet: 'border-t-purple-400',
  stone: 'border-t-stone-200',
};

interface Props {
  label: string;
  value: number | string;
  hint?: string;
  loading?: boolean;
  tone?: Tone;
}

export function StatCard({ label, value, hint, loading, tone = 'stone' }: Props) {
  return (
    <div className={`rounded-2xl border-t-2 ${TONE_ACCENT[tone]} ${TONE_BG[tone]} p-4 shadow-sm ring-1 ring-stone-900/[0.06]`}>
      <p className="text-xs leading-5 text-stone-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-stone-800">
        {loading ? <span className="text-stone-300">—</span> : value}
      </p>
      {hint && <p className="mt-1 text-xs leading-5 text-stone-400">{hint}</p>}
    </div>
  );
}

/** 加载与错误占位 */
export function ViewState({ loading, error, minHeight = 160 }: { loading?: boolean; error?: string; minHeight?: number }) {
  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-white/80 to-stone-50/60 text-sm text-stone-400 ring-1 ring-stone-900/[0.06]"
        style={{ minHeight }}
      >
        数据加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-white/80 to-stone-50/60 px-6 text-center text-sm text-stone-500 ring-1 ring-stone-900/[0.06]"
        style={{ minHeight }}
      >
        {error}
      </div>
    );
  }
  return null;
}
