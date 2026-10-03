'use client';

/**
 * 平台数据后台 · 用户 tab：用户构成卡片 + 用户明细样本表
 * demo 阶段 rows 为 80 行样本（summary 为全量口径）；真实版接 /api/admin/users 分页
 */
import { useMemo, useState } from 'react';
import { useAdminApi } from './use-admin-api';
import { StatCard, ViewState } from '@/components/mentor-console/stat-card';

interface UserRow {
  id: string; phone: string; name: string; role: string; boundMentor: string | null;
  status: string; payState: string; registeredAt: string; channel: string;
}
interface UsersResponse {
  summary: {
    total: number; newInRange: number; paid: number; active7d: number;
    byRole: { label: string; count: number }[];
    byStatus: { label: string; count: number }[];
    payFunnel: { label: string; count: number }[];
  };
  rows: UserRow[];
}

const ROLE_STYLE: Record<string, string> = {
  USER: 'bg-stone-100 text-stone-600',
  MENTOR_HUMAN: 'bg-emerald-100 text-emerald-700',
  ADMIN_FULL: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-purple-50 text-purple-500',
};
const ROLE_TEXT: Record<string, string> = {
  USER: '用户', MENTOR_HUMAN: '真人导师', ADMIN_FULL: '管理员', ADMIN: '管理员(旧)',
};
const PAY_STYLE: Record<string, string> = {
  订阅中: 'bg-amber-100 text-amber-700',
  仅加榨包: 'bg-orange-100 text-orange-700',
  免费试用: 'bg-sky-100 text-sky-700',
  未付费: 'bg-stone-100 text-stone-500',
};

export function UsersView() {
  const { data, loading, error } = useAdminApi<UsersResponse>('/api/admin/users');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const pageCount = data ? Math.max(1, Math.ceil(data.rows.length / pageSize)) : 1;
  const pageCur = Math.min(page, pageCount);
  const paged = useMemo(
    () => (data ? data.rows.slice((pageCur - 1) * pageSize, pageCur * pageSize) : []),
    [data, pageCur, pageSize],
  );

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="注册总用户" value={s.total.toLocaleString()} hint="完成手机号注册" tone="green" />
        <StatCard label="区间新增" value={`+${s.newInRange}`} hint="所选区间内新注册" tone="sky" />
        <StatCard label="付费用户" value={s.paid.toLocaleString()} hint={`付费率 ${((s.paid / s.total) * 100).toFixed(1)}%`} tone="amber" />
        <StatCard label="近 7 日活跃" value={s.active7d.toLocaleString()} hint="区间末日往前 7 天开口过" tone="indigo" />
      </div>

      {/* 构成三栏 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          { title: '角色构成', items: s.byRole },
          { title: '当前状态', items: s.byStatus },
          { title: '付费构成', items: s.payFunnel },
        ] as const).map((g) => {
          const max = Math.max(...g.items.map((x) => x.count));
          const total = g.items.reduce((sum, x) => sum + x.count, 0);
          return (
            <div key={g.title} className="rounded-2xl border-t-2 border-t-stone-200 bg-white p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
              <p className="text-xs text-stone-500">{g.title}</p>
              <div className="mt-2.5 space-y-2">
                {g.items.map((x) => (
                  <div key={x.label}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-stone-600">{x.label}</span>
                      <span className="font-semibold tabular-nums text-stone-800">
                        {x.count} <span className="font-normal text-stone-400">{((x.count / total) * 100).toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-[#55734B]/70" style={{ width: `${(x.count / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 用户明细样本 */}
      <div className="rounded-2xl bg-white/90 p-3 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="px-1 text-xs text-stone-400">用户明细（demo 样本 {data.rows.length} 行，按注册时间倒序；真实版支持全量分页与筛选）</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {['手机', '昵称', '角色', '绑定导师', '状态', '付费', '注册时间', '来源渠道'].map((h, i) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-stone-500 ${i === 0 ? 'rounded-l-lg' : ''} ${i === 7 ? 'rounded-r-lg' : ''}`}
                    style={{ backgroundColor: '#efeeeb' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((u, idx) => (
                <tr key={u.id}>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 tabular-nums ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{u.phone}</td>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 font-medium text-stone-800 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{u.name}</td>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_STYLE[u.role] ?? ROLE_STYLE.USER}`}>{ROLE_TEXT[u.role] ?? u.role}</span>
                  </td>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-xs text-stone-600 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{u.boundMentor ?? '—'}</td>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-xs text-stone-600 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{u.status}</td>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${PAY_STYLE[u.payState] ?? PAY_STYLE.未付费}`}>{u.payState}</span>
                  </td>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-xs tabular-nums text-stone-600 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{u.registeredAt}</td>
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-xs text-stone-600 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{u.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 分页 */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-xs text-stone-500">
          <div className="flex items-center gap-1">
            <span>每页</span>
            {[20, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => { setPageSize(n); setPage(1); }}
                className={`min-w-[2rem] rounded-md px-2 py-1 transition-colors ${
                  pageSize === n ? 'bg-[#0e7490] font-medium text-white' : 'border border-stone-200 bg-white text-stone-600 hover:border-cyan-300'
                }`}
              >
                {n}
              </button>
            ))}
            <span>条 · 样本 {data.rows.length} 行</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageCur <= 1}
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 transition-colors hover:border-cyan-300 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="tabular-nums">第 {pageCur} / {pageCount} 页</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={pageCur >= pageCount}
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 transition-colors hover:border-cyan-300 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
