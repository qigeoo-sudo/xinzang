'use client';

/** 留存：登录间隔 / 每次访问总时长 / 登录次数 三组分布 */
import { useAdminApi } from './use-admin-api';
import { ViewState } from '@/components/mentor-console/stat-card';

interface DistBlock {
  title: string;
  desc: string;
  medianLabel: string;
  buckets: { label: string; count: number }[];
}

interface RetentionResponse {
  dateRange: { start: string | null; end: string };
  loginIntervals: DistBlock;
  sessionDurations: DistBlock;
  loginCounts: DistBlock;
}

const BAR_COLORS = ['bg-emerald-300', 'bg-sky-300', 'bg-indigo-300'];

function DistCard({ block, barColor }: { block: DistBlock; barColor: string }) {
  const max = Math.max(...block.buckets.map((b) => b.count), 1);
  const total = block.buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-800">{block.title}</p>
          <p className="mt-0.5 text-xs text-stone-400">{block.desc}</p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
          中位 {block.medianLabel}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {block.buckets.map((b) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-stone-500">{b.label}</span>
              <div className="h-4 flex-1 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${Math.max((b.count / max) * 100, 2)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs text-stone-500">
                {b.count.toLocaleString()} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RetentionView() {
  const { data, loading, error } = useAdminApi<RetentionResponse>('/api/admin/retention');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const blocks: { key: string; block: DistBlock }[] = [
    { key: 'loginIntervals', block: data.loginIntervals },
    { key: 'sessionDurations', block: data.sessionDurations },
    { key: 'loginCounts', block: data.loginCounts },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-400">仅统计注册用户</p>
      {blocks.map((b, i) => (
        <DistCard key={b.key} block={b.block} barColor={BAR_COLORS[i % BAR_COLORS.length]} />
      ))}
    </div>
  );
}
