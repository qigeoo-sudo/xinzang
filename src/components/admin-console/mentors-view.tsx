'use client';

/**
 * 平台数据后台 · 导师 tab：平台级导师汇总（SABC 分档、收入、产能）
 * 数据契约复用 /api/admin/mentors（demo → /demo/admin/mentors.json）；
 * 详细排序/对话/画像/知识卡匹配在独立页 /admin-console/mentors
 */
import Link from 'next/link';
import { useAdminApi } from './use-admin-api';
import { StatCard, ViewState } from '@/components/mentor-console/stat-card';

interface MentorsLiteResponse {
  mentors: Array<{
    id: string; name: string; tier: string; revenueYuan: number;
    knowledgeCards: number; caseCount: number; subscribers: number;
    subPlans: { monthly: number; quarterly: number; yearly: number };
  }>;
}

const TIER_META: Record<string, { label: string; color: string; bg: string }> = {
  S: { label: 'S 级', color: '#b91c1c', bg: '#fee2e2' },
  A: { label: 'A 级', color: '#c2410c', bg: '#ffedd5' },
  B: { label: 'B 级', color: '#0369a1', bg: '#e0f2fe' },
  C: { label: 'C 级', color: '#57534e', bg: '#f5f5f4' },
};

export function MentorsView() {
  const { data, loading, error } = useAdminApi<MentorsLiteResponse>('/api/admin/mentors');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  const ms = data.mentors;
  const tierCount = (t: string) => ms.filter((m) => m.tier === t).length;
  const totalRevenue = ms.reduce((s, m) => s + m.revenueYuan, 0);
  const totalSubs = ms.reduce((s, m) => s + m.subscribers, 0);
  const totalSubTimes = ms.reduce((s, m) => s + m.subPlans.monthly + m.subPlans.quarterly + m.subPlans.yearly, 0);
  const totalCards = ms.reduce((s, m) => s + m.knowledgeCards, 0);
  const totalCases = ms.reduce((s, m) => s + m.caseCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-stone-400">平台导师阵容与产能汇总</p>
        <Link
          href="/admin-console/mentors"
          className="rounded-full bg-[#55734B] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#46603e]"
        >
          进入导师管理 →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="上线导师" value={ms.length} hint="含真人导师分身" tone="green" />
        <StatCard label="订阅确认收入" value={`¥${totalRevenue.toLocaleString()}`} hint="区间内按天摊销口径" tone="amber" />
        <StatCard label="订阅人数 / 人次" value={`${totalSubs} / ${totalSubTimes}`} hint="人数去重 · 人次含续费购卡" tone="sky" />
        <StatCard label="知识卡 / 案例" value={`${totalCards} / ${totalCases}`} hint="累计沉淀内容量" tone="indigo" />
      </div>

      {/* SABC 分档分布 */}
      <div className="rounded-2xl border-t-2 border-t-stone-200 bg-white p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-xs text-stone-500">SABC 分档分布（按订阅确认收入：前5% S / 至20% A / 至50% B / 其余 C）</p>
        <div className="mt-3 flex h-9 overflow-hidden rounded-full ring-1 ring-stone-900/10">
          {['S', 'A', 'B', 'C'].map((t) => {
            const n = tierCount(t);
            const pct = (n / ms.length) * 100;
            if (!n) return null;
            return (
              <div
                key={t}
                className="flex items-center justify-center text-xs font-semibold"
                style={{ width: `${pct}%`, backgroundColor: TIER_META[t].bg, color: TIER_META[t].color }}
                title={`${TIER_META[t].label} ${n} 位`}
              >
                {pct >= 8 ? `${t} · ${n}` : ''}
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {['S', 'A', 'B', 'C'].map((t) => (
            <div key={t} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: TIER_META[t].bg, color: TIER_META[t].color }}>
                {t}
              </span>
              <span className="text-sm text-stone-600">{tierCount(t)} 位</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
