'use client';

/** 概览：用户状态漏斗 + 流量核心数字 */
import { useAdminApi } from './use-admin-api';
import { StatCard, ViewState } from '@/components/mentor-console/stat-card';

interface OverviewResponse {
  dateRange: { start: string | null; end: string };
  users: {
    total: number;
    funnel: { key: string; label: string; count: number; desc: string }[];
    paidBreakdown: { key: string; label: string; count: number }[];
  };
  traffic: {
    totalPageViews: number;
    totalSessions: number;
    avgSessionSec: number;
    avgPagesPerSession: number;
  };
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
}

export function OverviewView() {
  const { data, loading, error } = useAdminApi<OverviewResponse>('/api/admin/overview');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const maxCount = data.users.funnel[0]?.count ?? 1;

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400">
        数据区间：{data.dateRange.start} 至 {data.dateRange.end}
      </p>

      {/* 流量核心数字 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="触达总人数" value={data.users.total.toLocaleString()} hint="看到过导师卡片的去重人数" tone="green" />
        <StatCard label="页面总访问量" value={data.traffic.totalPageViews.toLocaleString()} hint={`人均访问 ${data.traffic.avgPagesPerSession} 页/次`} tone="sky" />
        <StatCard label="访问总次数" value={data.traffic.totalSessions.toLocaleString()} hint="从进入到离开算一次" tone="indigo" />
        <StatCard label="平均每次停留" value={formatDuration(data.traffic.avgSessionSec)} hint="一次访问的总时长" tone="amber" />
      </div>

      {/* 用户状态漏斗 */}
      <div className="rounded-2xl border-t-2 border-t-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-xs text-stone-500">用户状态漏斗</p>
        <div className="mt-3 space-y-2.5">
          {data.users.funnel.map((step) => {
            const pct = Math.round((step.count / maxCount) * 100);
            return (
              <div key={step.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-stone-700">{step.label}</span>
                  <span className="font-semibold text-stone-800">{step.count.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/70">
                  <div
                    className="h-full rounded-full bg-[#55734B]"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-stone-400">{step.desc}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-stone-100 pt-3">
          <p className="text-xs text-stone-400">付费构成</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {data.users.paidBreakdown.map((b) => (
              <div key={b.key}>
                <p className="text-xl font-semibold text-stone-800">{b.count.toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-stone-400">{b.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
