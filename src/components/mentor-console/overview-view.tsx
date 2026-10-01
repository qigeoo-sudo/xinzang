'use client';

/** 首页概览：分身累计影响 + 反馈；不展示任何用户级信息
 *  全站分母默认隐藏，导师点「显示全体」后才出现；反馈卡不含全站数据
 *  所有统计量均为累计（从分身首次有数据到今天） */
import { useState } from 'react';
import { useApi } from './use-api';
import { ViewState } from './stat-card';

interface SummaryResponse {
  dateRange: { start: string | null; end: string };
  /** 导师本人账号活跃（截至本次登录，含本次）；真实后端就绪前由 demo JSON 提供 */
  accountActivity?: {
    loginCount: number;
    totalLoginDurationMin: number;
    submissionCount: number;
  };
  cumulative: {
    helpedUsers: number;
    impressionUsers: number;
    profileViewUsers: number;
    freeTrialUsers: number;
    paidRoundUsers: number;
    conversationCount: number;
    sessionCount: number;
    feedback: {
      likes: number;
      dislikes: number;
      reports: number;
      reportReasons?: Record<string, number>;
    };
    knowledgeCardCount: number;
    caseCardCount: number;
    subscriptionPurchases: number;
    creditPackPurchases: number;
    subscriptionMonthlyPurchases: number;
    subscriptionQuarterlyPurchases: number;
    subscriptionYearlyPurchases: number;
    subscriptionOtherPurchases: number;
  };
  platform: {
    cumulative: {
      helpedUsers: number;
      impressionUsers: number;
      profileViewUsers: number;
      freeTrialUsers: number;
      paidRoundUsers: number;
      conversationCount: number;
      knowledgeCardCount: number;
      caseCardCount: number;
      subscriptionPurchases: number;
      creditPackPurchases: number;
      subscriptionMonthlyPurchases: number;
      subscriptionQuarterlyPurchases: number;
      subscriptionYearlyPurchases: number;
      subscriptionOtherPurchases: number;
    };
  };
}

const REASON_LABELS: Record<string, string> = {
  OFFENSIVE: '冒犯',
  OFF_TOPIC: '偏题',
  HALLUCINATION: '幻觉',
  REPETITIVE: '反复',
  OTHER: '其他',
};

type Tone = 'green' | 'sky' | 'indigo' | 'amber' | 'rose' | 'violet' | 'stone';
const TONE_BG: Record<Tone, string> = {
  green: 'bg-gradient-to-br from-emerald-50 to-teal-50',
  sky: 'bg-gradient-to-br from-sky-50 to-cyan-50',
  indigo: 'bg-gradient-to-br from-indigo-50 to-violet-50',
  amber: 'bg-gradient-to-br from-amber-50 to-orange-50',
  rose: 'bg-gradient-to-br from-rose-50 to-pink-50',
  violet: 'bg-gradient-to-br from-violet-100 to-purple-100',
  stone: 'bg-gradient-to-br from-stone-50 to-stone-100',
};
const TONE_ACCENT: Record<Tone, string> = {
  green: 'border-t-emerald-300',
  sky: 'border-t-sky-300',
  indigo: 'border-t-indigo-300',
  amber: 'border-t-amber-300',
  rose: 'border-t-rose-300',
  violet: 'border-t-purple-400',
  stone: 'border-t-stone-200',
};

function PlatformStatCard({
  label,
  value,
  platformTotal,
  showPlatform,
  hint,
  loading,
  tone = 'stone',
}: {
  label: string;
  value: number;
  platformTotal?: number;
  showPlatform: boolean;
  hint?: string;
  loading?: boolean;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-2xl border-t-2 ${TONE_ACCENT[tone]} ${TONE_BG[tone]} p-4 shadow-sm ring-1 ring-stone-900/[0.06]`}>
      <p className="text-xs leading-5 text-stone-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-stone-800">
        {loading ? (
          <span className="text-stone-300">—</span>
        ) : showPlatform && platformTotal !== undefined ? (
          <>
            {value}
            <span className="text-base font-normal text-stone-400">/{platformTotal}</span>
          </>
        ) : (
          value
        )}
      </p>
      {hint && <p className="mt-1 text-xs leading-5 text-stone-400">{hint}</p>}
    </div>
  );
}

function PurchaseCell({
  value,
  platform,
  showPlatform,
  label,
}: {
  value: number;
  platform?: number;
  showPlatform: boolean;
  label: string;
}) {
  return (
    <div>
      <p className="text-xl font-semibold text-stone-800">
        {showPlatform && platform !== undefined ? (
          <>
            {value}
            <span className="text-sm font-normal text-stone-400">/{platform}</span>
          </>
        ) : (
          value
        )}
      </p>
      <p className="mt-0.5 text-xs text-stone-400">{label}</p>
    </div>
  );
}

export function OverviewView({ mentorName }: { mentorName?: string }) {
  const { data, loading, error } = useApi<SummaryResponse>(
    `/api/mentor/summary?range=90`,
  );
  const [showPlatform, setShowPlatform] = useState(false);

  if (loading && !data) return <ViewState loading />;
  if (error) return <ViewState error={error} />;

  const c = data?.cumulative;
  const p = data?.platform;
  const dr = data?.dateRange;

  return (
    <div className="space-y-4">
      {/* 数据区间 + 全站显示开关 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">
          {dr?.start ? `数据区间：${dr.start} 至 ${dr.end}` : '暂无数据'}
        </p>
        <button
          onClick={() => setShowPlatform((v) => !v)}
          className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 transition-colors hover:border-stone-300"
        >
          {showPlatform ? '隐藏全体' : '显示全体'}
        </button>
      </div>

      {/* 导师本人账号活跃：截至本次登录（含本次） */}
      {data?.accountActivity && (
        <p className="-mt-1 rounded-lg bg-white/70 px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-900/[0.05]">
          {mentorName ? `${mentorName}您好。` : '您好。'}截至本次登录，您累计登录{' '}
          <b className="text-stone-700">{data.accountActivity.loginCount}</b> 次
          {' · '}累计在线{' '}
          <b className="text-stone-700">
            {Math.floor(data.accountActivity.totalLoginDurationMin / 60)} 小时{' '}
            {data.accountActivity.totalLoginDurationMin % 60} 分
          </b>
          {' · '}累计提交内容 <b className="text-stone-700">{data.accountActivity.submissionCount}</b> 次
        </p>
      )}

      {/* 核心数字 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PlatformStatCard
          label="免费试用对话人数"
          value={c?.freeTrialUsers ?? 0}
          platformTotal={p?.cumulative.freeTrialUsers}
          showPlatform={showPlatform}
          hint="用免费3次聊过的人"
          loading={loading}
          tone="green"
        />
        <PlatformStatCard
          label="推荐覆盖人数"
          value={c?.impressionUsers ?? 0}
          platformTotal={p?.cumulative.impressionUsers}
          showPlatform={showPlatform}
          hint="看到过分身卡片的人数"
          loading={loading}
          tone="sky"
        />
        <PlatformStatCard
          label="对话线程总数"
          value={c?.sessionCount ?? 0}
          platformTotal={p?.cumulative.conversationCount}
          showPlatform={showPlatform}
          hint="用户发起的所有会话数"
          loading={loading}
          tone="indigo"
        />
        <PlatformStatCard
          label="知识卡数量"
          value={c?.knowledgeCardCount ?? 0}
          platformTotal={p?.cumulative.knowledgeCardCount}
          showPlatform={showPlatform}
          hint="分身已入库的外部知识卡"
          loading={loading}
          tone="violet"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PlatformStatCard
          label="付费权益对话人数"
          value={c?.paidRoundUsers ?? 0}
          platformTotal={p?.cumulative.paidRoundUsers}
          showPlatform={showPlatform}
          hint="用订阅或加榨包聊过的人"
          loading={loading}
          tone="green"
        />
        <PlatformStatCard
          label="主页访问人数"
          value={c?.profileViewUsers ?? 0}
          platformTotal={p?.cumulative.profileViewUsers}
          showPlatform={showPlatform}
          hint="打开过分身主页的人数"
          loading={loading}
          tone="sky"
        />
        <PlatformStatCard
          label="有效对话线程"
          value={c?.conversationCount ?? 0}
          platformTotal={p?.cumulative.conversationCount}
          showPlatform={showPlatform}
          hint="有实质来回交流的会话数"
          loading={loading}
          tone="indigo"
        />
        <PlatformStatCard
          label="案例卡数量"
          value={c?.caseCardCount ?? 0}
          platformTotal={p?.cumulative.caseCardCount}
          showPlatform={showPlatform}
          hint="两轮访谈后上传的案例卡"
          loading={loading}
          tone="violet"
        />
      </div>

      {/* 累计购买次数 */}
      <div className="rounded-2xl border-t-2 border-t-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">累计购买次数</p>
          {showPlatform && <span className="text-[10px] text-stone-400">分身 / 全体</span>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <PurchaseCell value={c?.freeTrialUsers ?? 0} platform={p?.cumulative.freeTrialUsers} showPlatform={showPlatform} label="免费" />
          <PurchaseCell value={c?.subscriptionPurchases ?? 0} platform={p?.cumulative.subscriptionPurchases} showPlatform={showPlatform} label="订阅合计" />
          <PurchaseCell value={c?.creditPackPurchases ?? 0} platform={p?.cumulative.creditPackPurchases} showPlatform={showPlatform} label="加榨包" />
        </div>
        <div className="mt-4 border-t border-stone-100 pt-3">
          <p className="text-xs text-stone-400">订阅次数（按套餐档位）</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PurchaseCell value={c?.subscriptionMonthlyPurchases ?? 0} platform={p?.cumulative.subscriptionMonthlyPurchases} showPlatform={showPlatform} label="月卡" />
            <PurchaseCell value={c?.subscriptionQuarterlyPurchases ?? 0} platform={p?.cumulative.subscriptionQuarterlyPurchases} showPlatform={showPlatform} label="季卡" />
            <PurchaseCell value={c?.subscriptionYearlyPurchases ?? 0} platform={p?.cumulative.subscriptionYearlyPurchases} showPlatform={showPlatform} label="年卡" />
            <PurchaseCell value={c?.subscriptionOtherPurchases ?? 0} platform={p?.cumulative.subscriptionOtherPurchases} showPlatform={showPlatform} label="其他" />
          </div>
        </div>
      </div>

      <p className="px-1 text-xs leading-5 text-stone-400">
        聚合数据每日凌晨更新；样本少于 5 人的画像分布不予展示。
      </p>
    </div>
  );
}
