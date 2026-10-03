'use client';

/**
 * 平台数据后台 · 渠道 tab：全渠道引流/转化/收入汇总
 * demo → /demo/admin/channels-summary.json；渠道增删改在独立页 /admin/channels
 */
import Link from 'next/link';
import { useAdminApi } from './use-admin-api';
import { StatCard, ViewState } from '@/components/mentor-console/stat-card';

interface ChannelRow {
  code: string; name: string; partner: string; kind: 'mentor' | 'org' | 'official';
  registrations: number; paidUsers: number;
  subRevenueYuan: number; creditRevenueYuan: number; lastRegisteredAt: string;
}
interface ChannelsResponse {
  summary: {
    channelCount: number; mentorChannelCount: number; orgChannelCount: number;
    totalRegistrations: number; totalPaid: number; totalRevenueYuan: number;
  };
  rows: ChannelRow[];
}

const KIND_STYLE: Record<ChannelRow['kind'], { label: string; cls: string }> = {
  mentor: { label: '导师渠道', cls: 'bg-emerald-100 text-emerald-700' },
  org: { label: '机构渠道', cls: 'bg-sky-100 text-sky-700' },
  official: { label: '官方渠道', cls: 'bg-purple-100 text-purple-700' },
};

export function ChannelsView() {
  const { data, loading, error } = useAdminApi<ChannelsResponse>('/api/admin/channels-summary');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const s = data.summary;
  const conv = ((s.totalPaid / s.totalRegistrations) * 100).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-stone-400">合作方约定：导师渠道合作方填导师英文名（创建时下拉选择），机构/官方渠道填机构名，渠道名称与合作方分成属性保持一致</p>
        <Link
          href="/admin/channels"
          className="shrink-0 rounded-full bg-[#55734B] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#46603e]"
        >
          进入渠道管理 →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="有效渠道" value={s.channelCount} hint={`导师 ${s.mentorChannelCount} · 机构/官方 ${s.orgChannelCount}`} tone="green" />
        <StatCard label="渠道引流注册" value={s.totalRegistrations.toLocaleString()} hint="注册时锁定渠道码" tone="sky" />
        <StatCard label="渠道付费用户" value={`${s.totalPaid}（${conv}%）`} hint="渠道引流用户中的付费转化" tone="amber" />
        <StatCard label="渠道贡献收入" value={`¥${s.totalRevenueYuan.toLocaleString()}`} hint="订阅摊销 + 加榨包消耗" tone="indigo" />
      </div>

      <div className="rounded-2xl bg-white/90 p-3 shadow-sm ring-1 ring-stone-900/[0.06]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {['渠道码', '渠道名称', '合作方', '类型', '引流注册', '付费用户', '转化率', '订阅收入', '加榨收入', '最近注册'].map((h, i) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-stone-500 ${i === 0 ? 'rounded-l-lg' : ''} ${i === 9 ? 'rounded-r-lg' : ''} ${i >= 4 && i <= 8 ? 'text-right' : ''}`}
                    style={{ backgroundColor: '#efeeeb' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, idx) => {
                const c = ((r.paidUsers / r.registrations) * 100).toFixed(1);
                return (
                  <tr key={r.code}>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 font-mono text-xs text-stone-500 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{r.code}</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 font-medium text-stone-800 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{r.name}</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-xs text-stone-600 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{r.partner}</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${KIND_STYLE[r.kind].cls}`}>{KIND_STYLE[r.kind].label}</span>
                    </td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-right tabular-nums ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{r.registrations}</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-right tabular-nums ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{r.paidUsers}</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-right tabular-nums text-stone-600 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{c}%</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-right tabular-nums ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>¥{r.subRevenueYuan.toLocaleString()}</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-right tabular-nums ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>¥{r.creditRevenueYuan.toLocaleString()}</td>
                    <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-xs tabular-nums text-stone-500 ${idx % 2 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>{r.lastRegisteredAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
