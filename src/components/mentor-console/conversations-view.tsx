'use client';

/** 对话效果：用户反馈 + 轮次分桶（累计/人均） + 趋势图（固定60天） */
import { useState } from 'react';
import { useApi } from './use-api';
import { ViewState } from './stat-card';
import { TrendChart } from './trend-chart';

interface SummaryResponse {
  dateRange: { start: string | null; end: string };
  cumulative: {
    helpedUsers: number;
    freeTrialUsers: number;
    sessionCount: number;
    conversationCount: number;
    rounds: number;
    freeTrialRounds: number;
    subscriptionRounds: number;
    creditPackRounds: number;
    feedback: {
      likes: number;
      dislikes: number;
      reports: number;
      reportReasons?: Record<string, number>;
    };
  };
}

interface TrendResponse {
  days: { date: string; [key: string]: number | string }[];
}

const REASON_LABELS: Record<string, string> = {
  OFFENSIVE: '冒犯',
  OFF_TOPIC: '偏题',
  HALLUCINATION: '幻觉',
  REPETITIVE: '反复',
  OTHER: '其他',
};

function RoundCell({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="text-xl font-semibold text-stone-800">{value}</p>
      <p className="mt-0.5 text-xs text-stone-400">{label}</p>
    </div>
  );
}

/** 对话线程卡：累计/人均切换 */
function ThreadCard({
  label,
  value,
  hint,
  helped,
  mode,
  setMode,
}: {
  label: string;
  value: number;
  hint: string;
  helped: number;
  mode: '累计' | '人均';
  setMode: (m: '累计' | '人均') => void;
}) {
  const display = mode === '人均' && helped > 0 ? (value / helped).toFixed(1) : String(value);
  return (
    <div className="rounded-2xl border-t-2 border-t-indigo-300 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-500">{label}</p>
        <div className="flex gap-1">
          {(['累计', '人均'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-0.5 text-[11px] transition-colors ${
                mode === m
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-2xl font-semibold text-stone-900">{display}</p>
      <p className="mt-0.5 text-xs text-stone-400">{hint}</p>
    </div>
  );
}

export function ConversationsView() {
  const summary = useApi<SummaryResponse>(`/api/mentor/summary?range=90`);
  const trend = useApi<TrendResponse>(`/api/mentor/trend?range=60`);
  const [metric, setMetric] = useState('completed_qa_rounds');
  const [roundMode, setRoundMode] = useState<'累计' | '人均'>('累计');
  const [totalThreadMode, setTotalThreadMode] = useState<'累计' | '人均'>('累计');
  const [validThreadMode, setValidThreadMode] = useState<'累计' | '人均'>('累计');

  if (summary.loading && !summary.data) return <ViewState loading />;
  if (summary.error) return <ViewState error={summary.error} />;

  const c = summary.data?.cumulative;
  const helped = c?.helpedUsers ?? 0;
  const displayRound = (v: number) =>
    roundMode === '人均' && helped > 0 ? (v / helped).toFixed(1) : String(v);

  return (
    <div className="space-y-4">
      {/* 数据区间 */}
      <p className="px-1 text-xs text-stone-400">
        {summary.data?.dateRange?.start
          ? `数据区间：${summary.data.dateRange.start} 至 ${summary.data.dateRange.end}`
          : '暂无数据'}
      </p>

      {/* 用户反馈（从概览移来） */}
      <div className="rounded-2xl border-t-2 border-t-rose-300 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-xs text-stone-500">用户反馈（累计）</p>
        <div className="mt-3 flex gap-6 text-sm">
          <span className="text-stone-700">赞 <b className="ml-1 text-stone-900">{c?.feedback.likes ?? 0}</b></span>
          <span className="text-stone-700">踩 <b className="ml-1 text-stone-900">{c?.feedback.dislikes ?? 0}</b></span>
          <span className="text-stone-700">报错 <b className="ml-1 text-stone-900">{c?.feedback.reports ?? 0}</b></span>
        </div>
        {(c?.feedback.reports ?? 0) > 0 && c?.feedback.reportReasons && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="text-xs text-stone-400">报错细类</p>
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-stone-600">
              {Object.entries(c.feedback.reportReasons)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <span key={reason}>
                    {REASON_LABELS[reason] ?? reason} <b className="text-stone-800">{count}</b>
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* 对话线程 */}
      <div className="grid grid-cols-2 gap-3">
        <ThreadCard
          label="对话线程"
          value={c?.sessionCount ?? 0}
          hint="用户发起的所有会话数"
          helped={helped}
          mode={totalThreadMode}
          setMode={setTotalThreadMode}
        />
        <ThreadCard
          label="有效对话线程"
          value={c?.conversationCount ?? 0}
          hint="有实质来回交流的会话数"
          helped={helped}
          mode={validThreadMode}
          setMode={setValidThreadMode}
        />
      </div>

      {/* 轮次 */}
      <div className="rounded-2xl border-t-2 border-t-indigo-300 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">对话轮次</p>
          <div className="flex gap-1">
            {(['累计', '人均'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setRoundMode(mode)}
                className={`rounded-md px-2.5 py-0.5 text-[11px] transition-colors ${
                  roundMode === mode
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <RoundCell value={displayRound(c?.rounds ?? 0)} label="合计" />
          <RoundCell value={displayRound(c?.freeTrialRounds ?? 0)} label="免费" />
          <RoundCell value={displayRound(c?.subscriptionRounds ?? 0)} label="订阅" />
          <RoundCell value={displayRound(c?.creditPackRounds ?? 0)} label="加榨包" />
        </div>
      </div>

      {trend.loading && !trend.data ? (
        <ViewState loading minHeight={220} />
      ) : trend.error ? (
        <ViewState error={trend.error} minHeight={220} />
      ) : (
        <TrendChart
          days={trend.data?.days ?? []}
          activeKey={metric}
          onSelect={setMetric}
          metrics={[
            { key: 'completed_qa_rounds', label: '完成问答', kind: 'bar', unit: '次', stackKeys: ['free_trial_rounds', 'billed_rounds'], scaleGroup: 'rounds' },
            { key: 'billed_rounds', label: '计费', kind: 'bar', unit: '次', scaleGroup: 'rounds' },
            { key: 'free_trial_rounds', label: '免费', kind: 'bar', unit: '次', scaleGroup: 'rounds' },
            { key: 'impression_count', label: '推荐', kind: 'bar', unit: '次' },
            { key: 'profile_view_count', label: '访问', kind: 'bar', unit: '次' },
            { key: 'helped_user_count', label: '累计帮助', kind: 'line', unit: '人', cumulative: true },
            { key: 'session_count', label: '累计线程', kind: 'line', unit: '条', cumulative: true },
            { key: 'paid_purchase_count', label: '累计付费', kind: 'line', unit: '次', cumulative: true },
          ]}
        />
      )}
    </div>
  );
}
