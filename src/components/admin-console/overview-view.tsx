'use client';

/** 概览：访问/聊天核心数字 + 梯形转化漏斗 */
import { Fragment } from 'react';
import { useAdminApi } from './use-admin-api';
import { StatCard, ViewState } from '@/components/mentor-console/stat-card';

interface OverviewResponse {
  dateRange: { start: string | null; end: string };
  users: {
    funnel: { key: string; label: string; count: number; desc: string }[];
    paidBreakdown: { key: string; label: string; count: number }[];
  };
  traffic: {
    totalPageViews: number;
    totalSessions: number;
    avgSessionSec: number;
    avgPagesPerSession: number;
    mentorProfileViews: number;
    totalChats: number;
    avgChatSec: number;
  };
}

/** 漏斗 7 段配色：浅青 → 深青（呼应主色 #0e7490） */
const FUNNEL_COLORS = ['#dff4f9', '#b3e4ee', '#7fd1e2', '#46b3cb', '#1793ab', '#0e7490', '#0b5561'];
/** 深色段索引起点（该段及以后用白字） */
const LIGHT_TEXT_FROM = 3;
const MIN_BAR_PCT = 18;

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

  const funnel = data.users.funnel;
  const topCount = funnel[0]?.count ?? 1;
  // 展示宽度（百分比），末段保底 18% 保证数字可读
  const widths = funnel.map((s) => Math.max(MIN_BAR_PCT, (s.count / topCount) * 100));

  return (
    <div className="space-y-4">
      {/* 核心数字：3 列，每列纵向 2 张卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-3">
          <StatCard label="页面总访问量" value={data.traffic.totalPageViews.toLocaleString()} hint={`人均访问 ${data.traffic.avgPagesPerSession} 页/次`} tone="sky" />
          <StatCard label="导师总访问量" value={data.traffic.mentorProfileViews.toLocaleString()} hint="导师主页浏览量，含重复访问" tone="indigo" />
        </div>
        <div className="flex flex-col gap-3">
          <StatCard label="访问总次数" value={data.traffic.totalSessions.toLocaleString()} hint="从进入到离开算一次" tone="indigo" />
          <StatCard label="聊天总次数" value={data.traffic.totalChats.toLocaleString()} hint="有效会话数：至少完成 1 轮对话，按 ChatSession 计" tone="green" />
        </div>
        <div className="flex flex-col gap-3">
          <StatCard label="平均每次停留" value={formatDuration(data.traffic.avgSessionSec)} hint="一次访问的总时长" tone="amber" />
          <StatCard label="平均每次聊天" value={formatDuration(data.traffic.avgChatSec)} hint="有效会话时长均值：末条消息−首条消息，相邻消息闲置超 5 分钟的空档剔除" tone="rose" />
        </div>
      </div>

      {/* 用户状态梯形漏斗 */}
      <div className="rounded-2xl border-t-2 border-t-cyan-300 bg-white p-4 shadow-sm ring-1 ring-stone-900/[0.06] sm:p-6">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-stone-500">用户状态漏斗</p>
          <p className="text-[11px] text-stone-400">右侧为相对触达的留存比例</p>
        </div>

        <div className="mt-4">
          {funnel.map((step, i) => {
            const ratio = step.count / topCount;
            const stepConv = i === 0 ? null : ((step.count / funnel[i - 1].count) * 100).toFixed(1);
            const isLast = i === funnel.length - 1;
            // 连接斜面：上宽=本段，下宽=下一段，用 clip-path 切出梯形
            const inset = isLast ? 0 : ((1 - widths[i + 1] / widths[i]) / 2) * 100;
            return (
              <Fragment key={step.key}>
                <div
                  className="grid items-center gap-2 sm:gap-3"
                  style={{ gridTemplateColumns: 'minmax(5rem,6.5rem) 1fr minmax(3.5rem,4.5rem)' }}
                >
                  {/* 左：阶段名 + 说明 */}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-stone-700 sm:text-sm">{step.label}</p>
                    <p className="hidden text-[10px] leading-4 text-stone-400 sm:block">{step.desc}</p>
                  </div>
                  {/* 中：梯形条 */}
                  <div className="flex justify-center">
                    <div
                      className="flex h-10 items-center justify-center rounded-[3px] text-sm font-semibold shadow-sm sm:h-12"
                      style={{
                        width: `${widths[i]}%`,
                        backgroundColor: FUNNEL_COLORS[i],
                        color: i >= LIGHT_TEXT_FROM ? '#ffffff' : '#0b3d47',
                      }}
                      title={step.desc}
                    >
                      {step.count.toLocaleString()}
                    </div>
                  </div>
                  {/* 右：相对触达比例 + 环比 */}
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums text-stone-700 sm:text-sm">{(ratio * 100).toFixed(1)}%</p>
                    {stepConv && <p className="hidden text-[10px] tabular-nums text-stone-400 sm:block">环比 {stepConv}%</p>}
                  </div>
                </div>
                {/* 段间斜面连接 */}
                {!isLast && (
                  <div
                    className="grid gap-2 sm:gap-3"
                    style={{ gridTemplateColumns: 'minmax(5rem,6.5rem) 1fr minmax(3.5rem,4.5rem)' }}
                  >
                    <div />
                    <div className="flex justify-center">
                      <div
                        className="h-3 sm:h-4"
                        style={{
                          width: `${widths[i]}%`,
                          backgroundColor: FUNNEL_COLORS[i],
                          opacity: 0.4,
                          clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`,
                        }}
                      />
                    </div>
                    <div />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        <div className="mt-5 border-t border-stone-100 pt-3">
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
