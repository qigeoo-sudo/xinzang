'use client';

/** 行为链：全体用户拓扑路由图 + 抽样用户的逐次访问行为流 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useAdminApi } from './use-admin-api';
import { Pagination, paginate } from './pagination';
import { ViewState } from '@/components/mentor-console/stat-card';
import { maskName, maskPhone } from '@/lib/privacy-mask';

// React Flow 依赖较重且依赖 DOM，仅客户端加载
const JourneyTopology = dynamic(
  () => import('./journey-topology').then((m) => m.JourneyTopology),
  { ssr: false, loading: () => <div className="rounded-2xl bg-white p-6 text-center text-xs text-stone-400 ring-1 ring-stone-900/[0.06]">拓扑图加载中…</div> },
);

interface JourneyEvent {
  offset: number;
  type: 'page.view' | 'cta.click' | 'subscribe.click';
  page: string;
  dwellSec?: number;
  label?: string;
  note?: string;
}

interface JourneySession {
  no: number;
  date: string;
  startedAt: string;
  durationSec: number;
  exitPage: string;
  events: JourneyEvent[];
}

interface JourneyUser {
  id: string;
  phone: string;
  name: string;
  state: string;
  stateLabel: string;
  registeredAt: string | null;
  totalSessions: number;
  totalDurationSec: number;
  loginIntervalDays: number[];
  outcome: {
    type: 'subscribed' | 'churned' | 'active';
    plan?: string;
    at: string;
    lastPageBeforeSubscribe?: string;
    lastPage?: string;
  };
  sessions: JourneySession[];
}

interface JourneysResponse {
  dateRange: { start: string | null; end: string };
  sampleSize: number;
  note: string;
  users: JourneyUser[];
}

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'SUBSCRIBED', label: '已订阅' },
  { key: 'FREE_TRIAL', label: '试用中' },
  { key: 'CREDIT_PACK', label: '加榨包' },
  { key: 'CHURNED', label: '已流失' },
] as const;

const STATE_BADGE: Record<string, string> = {
  SUBSCRIBED: 'bg-emerald-100 text-emerald-700',
  FREE_TRIAL: 'bg-sky-100 text-sky-700',
  CREDIT_PACK: 'bg-amber-100 text-amber-700',
  CHURNED: 'bg-stone-200 text-stone-500',
};

const PLAN_LABEL: Record<string, string> = {
  MONTHLY: '月卡',
  QUARTERLY: '季卡',
  YEARLY: '年卡',
};

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
}

function formatOffset(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `+${m}:${String(s).padStart(2, '0')}`;
}

function OutcomeBanner({ outcome }: { outcome: JourneyUser['outcome'] }) {
  if (outcome.type === 'subscribed') {
    return (
      <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
        {outcome.at} 订阅成功（{PLAN_LABEL[outcome.plan ?? ''] ?? outcome.plan}）
        {outcome.lastPageBeforeSubscribe && (
          <> · 订阅前最后访问页面：<span className="font-mono">{outcome.lastPageBeforeSubscribe}</span></>
        )}
      </p>
    );
  }
  if (outcome.type === 'churned') {
    return (
      <p className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-500">
        {outcome.at} 后未再回来 · 最后停留在{' '}
        <span className="font-mono">{outcome.lastPage}</span>
      </p>
    );
  }
  return (
    <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-700">
      仍活跃 · 最近访问 {outcome.at}，最后停留在{' '}
      <span className="font-mono">{outcome.lastPage}</span>
    </p>
  );
}

function SessionBlock({ session }: { session: JourneySession }) {
  return (
    <div className="rounded-xl bg-stone-50/80 p-3 ring-1 ring-stone-900/[0.04]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-stone-700">
          第 {session.no} 次访问 · {session.date} {session.startedAt}
        </p>
        <p className="text-xs text-stone-400">
          停留 {formatDuration(session.durationSec)} · 在{' '}
          <span className="font-mono">{session.exitPage}</span> 离开
        </p>
      </div>
      <ol className="mt-2 space-y-1.5 border-l-2 border-stone-200 pl-3">
        {session.events.map((e, i) => {
          const isLast = i === session.events.length - 1;
          return (
            <li key={i} className="text-xs leading-5">
              <span className="mr-1.5 font-mono text-stone-400">{formatOffset(e.offset)}</span>
              {e.type === 'page.view' && (
                <span className="text-stone-700">
                  浏览 <span className="font-mono">{e.page}</span>
                  {e.dwellSec !== undefined && (
                    <span className="text-stone-400">（{formatDuration(e.dwellSec)}）</span>
                  )}
                </span>
              )}
              {e.type === 'cta.click' && (
                <span className="text-indigo-600">点击「{e.label}」</span>
              )}
              {e.type === 'subscribe.click' && (
                <span className="font-semibold text-emerald-600">点击「{e.label}」</span>
              )}
              {e.note && <span className="ml-1 text-stone-400">— {e.note}</span>}
              {isLast && (
                <span className="ml-1.5 rounded bg-stone-200 px-1 py-0.5 text-[10px] text-stone-500">
                  离开本站
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function JourneysView() {
  const { data, loading, error } = useAdminApi<JourneysResponse>('/api/admin/journeys');
  const [filter, setFilter] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const users = filter === 'ALL' ? data.users : data.users.filter((u) => u.state === filter);
  const { paged } = paginate(users, page, pageSize);

  return (
    <div className="space-y-3">
      {/* 全体用户行为拓扑图（树状/星状，数据按页面/按钮 tab 锚定） */}
      <JourneyTopology />

      {/* 状态筛选 */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              filter === f.key
                ? 'bg-[#55734B] text-white'
                : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {users.length === 0 && (
        <p className="py-8 text-center text-sm text-stone-400">该状态下没有抽样用户</p>
      )}

      {paged.map((u) => {
        const open = expanded === u.id;
        return (
          <div
            key={u.id}
            className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]"
          >
            <button
              onClick={() => setExpanded(open ? null : u.id)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-stone-800">{maskName(u.name)}</span>
                  <span className="font-mono text-xs tabular-nums text-stone-500">{maskPhone(u.phone)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATE_BADGE[u.state] ?? 'bg-stone-200 text-stone-500'}`}
                  >
                    {u.stateLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  {u.registeredAt ? `${u.registeredAt} 注册 · ` : '未注册 · '}
                  共访问 {u.totalSessions} 次 · 累计停留 {formatDuration(u.totalDurationSec)}
                  {u.loginIntervalDays.length > 0 &&
                    ` · 登录间隔 ${u.loginIntervalDays.join(' / ')} 天`}
                </p>
              </div>
              <span className="shrink-0 text-xs text-stone-400">{open ? '收起' : '展开'}</span>
            </button>

            {open && (
              <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                {u.sessions.map((s) => (
                  <SessionBlock key={s.no} session={s} />
                ))}
                <OutcomeBanner outcome={u.outcome} />
              </div>
            )}
          </div>
        );
      })}

      {/* 底部分页 */}
      <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-sm ring-1 ring-stone-900/[0.06]">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={users.length}
          totalUnit="位"
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>
    </div>
  );
}
