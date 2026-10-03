'use client';

/** 页面：每个网页的访问量 / 独立访客 / 平均停留 / 离开率 */
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

export function PagesView() {
  const { data, loading, error } = useAdminApi<PagesResponse>('/api/admin/pages');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const maxViews = Math.max(...data.pages.map((p) => p.views), 1);

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-400">离开率 = 以该页结束访问的比例</p>

      <div className="space-y-2">
        {data.pages.map((p) => (
          <div
            key={p.path}
            className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-800">{p.label}</p>
                <p className="font-mono text-[11px] text-stone-400">{p.path}</p>
              </div>
              <p className="shrink-0 text-lg font-semibold text-stone-800">
                {p.views.toLocaleString()}
                <span className="ml-1 text-xs font-normal text-stone-400">次访问</span>
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-sky-300"
                style={{ width: `${Math.max((p.views / maxViews) * 100, 2)}%` }}
              />
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs text-stone-500">
              <span>独立访客 {p.uniqueVisitors.toLocaleString()}</span>
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
