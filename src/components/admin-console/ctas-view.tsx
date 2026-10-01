'use client';

/** 按钮：首页三张卡片使用量突出展示 + 其他功能按钮排行 */
import { useAdminApi } from './use-admin-api';
import { ViewState } from '@/components/mentor-console/stat-card';

interface CtaStat {
  ctaId: string;
  label: string;
  card?: string;
  clicks: number;
  uniqueUsers: number;
  topDestinations: { page: string; count: number }[];
}

interface CtasResponse {
  dateRange: { start: string | null; end: string };
  spotlight: CtaStat[];
  others: CtaStat[];
}

const CARD_TONE: Record<string, string> = {
  杏金卡: 'border-t-amber-300 bg-gradient-to-br from-amber-50 to-orange-50',
  鼠尾草绿卡: 'border-t-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50',
  珊瑚卡: 'border-t-rose-300 bg-gradient-to-br from-rose-50 to-pink-50',
};

export function CtasView() {
  const { data, loading, error } = useAdminApi<CtasResponse>('/api/admin/ctas');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const maxOther = Math.max(...data.others.map((c) => c.clicks), 1);

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400">
        数据区间：{data.dateRange.start} 至 {data.dateRange.end}
      </p>

      {/* 首页三张卡片 */}
      <div>
        <p className="mb-2 text-xs text-stone-500">首页三张卡片使用量</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.spotlight.map((c) => (
            <div
              key={c.ctaId}
              className={`rounded-2xl border-t-2 p-4 shadow-sm ring-1 ring-stone-900/[0.06] ${CARD_TONE[c.card ?? ''] ?? 'border-t-stone-200 bg-gradient-to-br from-stone-50 to-stone-100'}`}
            >
              <p className="text-xs text-stone-500">{c.card}</p>
              <p className="mt-1 text-sm font-semibold text-stone-800">{c.label}</p>
              <p className="mt-2 text-2xl font-semibold text-stone-800">
                {c.clicks.toLocaleString()}
                <span className="ml-1 text-xs font-normal text-stone-400">次点击</span>
              </p>
              <p className="mt-1 text-xs text-stone-400">
                {c.uniqueUsers.toLocaleString()} 人用过
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 其他功能按钮 */}
      <div>
        <p className="mb-2 text-xs text-stone-500">其他功能按钮</p>
        <div className="space-y-2">
          {data.others.map((c) => (
            <div
              key={c.ctaId}
              className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-stone-800">{c.label}</p>
                <p className="shrink-0 text-lg font-semibold text-stone-800">
                  {c.clicks.toLocaleString()}
                  <span className="ml-1 text-xs font-normal text-stone-400">次</span>
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-indigo-300"
                  style={{ width: `${Math.max((c.clicks / maxOther) * 100, 2)}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                <span>{c.uniqueUsers.toLocaleString()} 人用过</span>
                {c.topDestinations.length > 0 && (
                  <span>
                    点击后去向：
                    {c.topDestinations
                      .map((d) => `${d.page}（${d.count.toLocaleString()}）`)
                      .join('、')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
