'use client';

/** 按钮：首页三张卡片使用量 + 付费漏斗（档位点击→创建订单→支付成功）+ 其他功能按钮排行 */
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

interface FunnelStage {
  stage: 'select' | 'order' | 'success';
  label: string;
  events: number;
  users: number;
  revenue?: number;
}
interface PayFunnel {
  plan: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CREDIT_PACK';
  label: string;
  price: number;
  stages: FunnelStage[];
}

interface CtasResponse {
  dateRange: { start: string | null; end: string };
  spotlight: CtaStat[];
  others: CtaStat[];
  funnels?: PayFunnel[];
}

const CARD_TONE: Record<string, string> = {
  杏金卡: 'border-t-amber-300 bg-gradient-to-br from-amber-50 to-orange-50',
  鼠尾草绿卡: 'border-t-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50',
  珊瑚卡: 'border-t-rose-300 bg-gradient-to-br from-rose-50 to-pink-50',
};

const STAGE_BAR = ['bg-orange-400', 'bg-cyan-600', 'bg-emerald-600'];
const STAGE_TEXT = ['text-orange-700', 'text-cyan-700', 'text-emerald-700'];

function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function CtasView() {
  const { data, loading, error } = useAdminApi<CtasResponse>('/api/admin/ctas');

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!data) return null;

  // 固定按次数降序；次数/人数各取该列最大值独立归一化（两口径量级不同，独立基准才可比）
  const sortedOthers = [...data.others].sort((a, b) => b.clicks - a.clicks);
  const maxClicks = Math.max(...sortedOthers.map((c) => c.clicks), 1);
  const maxUsers = Math.max(...sortedOthers.map((c) => c.uniqueUsers), 1);

  return (
    <div className="space-y-4">
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

      {/* 付费漏斗：档位点击 → 创建订单 → 支付成功 */}
      {data.funnels && data.funnels.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-stone-500">
            付费漏斗 · 档位点击 → 创建订单（选定支付方式）→ 支付成功；条下为事件次数 / 去重人数
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.funnels.map((f) => {
              const top = f.stages[0]?.events ?? 1;
              const last = f.stages[f.stages.length - 1];
              return (
                <div
                  key={f.plan}
                  className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]"
                >
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold text-stone-800">{f.label}</p>
                    <p className="text-xs text-stone-400">￥{f.price}</p>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {f.stages.map((s, i) => (
                      <div key={s.stage}>
                        <div className="h-7 w-full overflow-hidden rounded-md bg-stone-100">
                          <div
                            className={`flex h-full items-center justify-end rounded-md pr-2 text-[11px] font-semibold text-white ${STAGE_BAR[i]}`}
                            style={{ width: `${Math.max((s.events / top) * 100, 12)}%` }}
                          >
                            {s.events.toLocaleString()}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-stone-500">
                          <span>{s.label}</span>
                          <span>
                            {s.users.toLocaleString()} 人
                            {i > 0 && (
                              <span className={`ml-1.5 font-semibold ${STAGE_TEXT[i]}`}>
                                环转化 {pct(s.events, f.stages[i - 1].events)}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-dashed border-stone-200 pt-2 text-[11px] text-stone-500">
                    总转化 <span className="font-semibold text-emerald-700">{pct(last.events, top)}</span>
                    {typeof last.revenue === 'number' && (
                      <span className="float-right">
                        收入 <span className="font-semibold text-stone-700">￥{last.revenue.toLocaleString()}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 其他功能按钮 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-stone-500">其他功能按钮（按次数从高到低）</p>
          <div className="flex items-center gap-3 text-[11px] text-stone-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-indigo-400" />
              次数
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-cyan-600" />
              人数
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {sortedOthers.map((c) => (
            <CtaRow key={c.ctaId} c={c} maxClicks={maxClicks} maxUsers={maxUsers} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CtaRow({
  c,
  maxClicks,
  maxUsers,
}: {
  c: CtaStat;
  maxClicks: number;
  maxUsers: number;
}) {
  return (
    <div className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <p className="text-sm font-semibold text-stone-800">{c.label}</p>

      {/* 次数条（蓝） */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-indigo-400"
            style={{ width: `${Math.max((c.clicks / maxClicks) * 100, 2)}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right text-xs text-stone-600">
          {c.clicks.toLocaleString()} 次
        </span>
      </div>

      {/* 人数条（青） */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-cyan-600"
            style={{ width: `${Math.max((c.uniqueUsers / maxUsers) * 100, 2)}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right text-xs text-stone-600">
          {c.uniqueUsers.toLocaleString()} 人
        </span>
      </div>

      {c.topDestinations.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          点击后去向：
          {c.topDestinations.map((d) => `${d.page}（${d.count.toLocaleString()}）`).join('、')}
        </p>
      )}
    </div>
  );
}
