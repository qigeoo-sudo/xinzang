'use client';

/**
 * 导师管理 — 排序列表 / 对话效果汇总 / 用户画像汇总
 * 排序列表里每位导师姓名可点击，进入导师视角预览页（该导师登录导师后台看到的一切）。
 * 审核信息：待审核可点开浮窗，逐条通过/退回（退回需填理由）；demo 阶段仅本地生效。
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useAdminApi } from '@/components/admin-console/use-admin-api';
import { ViewState } from '@/components/mentor-console/stat-card';
import { GoldFlakes, PaperCredits } from '@/components/page-shell';

interface PendingItem { id: string; type: string; title: string; submittedAt: string }
interface Review { status: 'APPROVED' | 'PENDING' | 'REJECTED'; pendingItems: PendingItem[]; lastReviewAt: string | null; rejectReason: string | null }
interface MentorRow {
  id: string; name: string; chineseName: string; tier: string;
  revenueYuan: number; subscribers: number; importedAt: string;
  totalDurationMin: number; rounds: number; knowledgeCards: number; caseCards: number;
  dialogue: { helpedUsers: number; validSessions: number; rounds: number; freeTrialRounds: number; likes: number; dislikes: number; reports: number; avgRoundsPerSession: number };
  audience: { totalUsers: number; topAge: string; topCareer: string; topRiasec: string; topHelp: string };
  review: Review;
}
interface MentorsResponse { dateRange: { start: string | null; end: string }; mentors: MentorRow[] }

const SORTS = [
  { key: 'revenue', label: '订阅金额' },
  { key: 'importedAt', label: '入库时间' },
  { key: 'duration', label: '对话时长' },
  { key: 'cards', label: '知识卡数量' },
  { key: 'nameEn', label: '英文名姓' },
  { key: 'nameZh', label: '中文姓名' },
  { key: 'review', label: '审核信息' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const REVIEW_ORDER: Record<Review['status'], number> = { PENDING: 0, REJECTED: 1, APPROVED: 2 };
const REVIEW_TEXT: Record<Review['status'], string> = { PENDING: '待审核', REJECTED: '已退回', APPROVED: '已通过' };

function ReviewCell({ review, onOpen }: { review: Review; onOpen: () => void }) {
  if (review.status === 'PENDING') {
    return (
      <button
        onClick={(e) => { e.preventDefault(); onOpen(); }}
        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
      >
        待审核（{review.pendingItems.length}）
      </button>
    );
  }
  if (review.status === 'REJECTED') {
    return (
      <button
        onClick={(e) => { e.preventDefault(); onOpen(); }}
        className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-200"
      >
        已退回
      </button>
    );
  }
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">已通过</span>;
}

function ReviewModal({
  mentor, review, onClose, onApprove, onReject,
}: {
  mentor: MentorRow;
  review: Review;
  onClose: () => void;
  onApprove: (mentorId: string, itemId: string) => void;
  onReject: (mentorId: string, itemId: string, reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState<PendingItem | null>(null);
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-stone-800">
              {mentor.name}（{mentor.chineseName}）· 审核
            </p>
            {review.lastReviewAt && (
              <p className="mt-0.5 text-xs text-stone-400">上次审核：{review.lastReviewAt}</p>
            )}
          </div>
          <button onClick={onClose} className="text-xs text-stone-400 hover:text-stone-600">关闭</button>
        </div>

        {review.status === 'REJECTED' && review.rejectReason && review.pendingItems.length === 0 && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
            退回理由：{review.rejectReason}
          </p>
        )}

        <div className="mt-3 space-y-2">
          {review.pendingItems.length === 0 && review.status !== 'REJECTED' && (
            <p className="py-4 text-center text-sm text-stone-400">没有待审核内容</p>
          )}
          {review.pendingItems.map((item) => (
            <div key={item.id} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-900/[0.05]">
              <div className="flex items-center gap-2">
                <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600">{item.type}</span>
                <p className="text-sm font-medium text-stone-800">{item.title}</p>
              </div>
              <p className="mt-1 text-xs text-stone-400">提交于 {item.submittedAt}</p>
              {rejecting?.id === item.id ? (
                <div className="mt-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="请填写退回理由（必填）"
                    rows={2}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={() => { setRejecting(null); setReason(''); }} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600">
                      取消
                    </button>
                    <button
                      onClick={() => {
                        if (!reason.trim()) return;
                        onReject(mentor.id, item.id, reason.trim());
                        setRejecting(null);
                        setReason('');
                      }}
                      disabled={!reason.trim()}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      确认退回
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => onApprove(mentor.id, item.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
                  >
                    通过
                  </button>
                  <button
                    onClick={() => setRejecting(item)}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    退回
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MentorsAdminPage() {
  const { data, loading, error } = useAdminApi<MentorsResponse>('/api/admin/mentors');
  const [tab, setTab] = useState<'list' | 'dialogue' | 'audience'>('list');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, Review>>({});
  const [modalMentorId, setModalMentorId] = useState<string | null>(null);

  const mentors = useMemo(() => {
    if (!data) return [];
    return data.mentors.map((m) => ({ ...m, review: reviewOverrides[m.id] ?? m.review }));
  }, [data, reviewOverrides]);

  const sorted = useMemo(() => {
    const arr = [...mentors];
    switch (sortKey) {
      case 'revenue': return arr.sort((a, b) => b.revenueYuan - a.revenueYuan);
      case 'importedAt': return arr.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
      case 'duration': return arr.sort((a, b) => b.totalDurationMin - a.totalDurationMin);
      case 'cards': return arr.sort((a, b) => b.knowledgeCards - a.knowledgeCards);
      case 'nameEn': return arr.sort((a, b) => a.name.localeCompare(b.name));
      case 'nameZh': return arr.sort((a, b) => a.chineseName.localeCompare(b.chineseName, 'zh'));
      case 'review': return arr.sort((a, b) => REVIEW_ORDER[a.review.status] - REVIEW_ORDER[b.review.status] || b.revenueYuan - a.revenueYuan);
    }
  }, [mentors, sortKey]);

  const modalMentor = mentors.find((m) => m.id === modalMentorId) ?? null;

  function approve(mentorId: string, itemId: string) {
    setReviewOverrides((prev) => {
      const base = prev[mentorId] ?? mentors.find((m) => m.id === mentorId)!.review;
      const items = base.pendingItems.filter((i) => i.id !== itemId);
      return { ...prev, [mentorId]: { ...base, pendingItems: items, status: items.length === 0 ? 'APPROVED' : 'PENDING' } };
    });
  }
  function reject(mentorId: string, itemId: string, reason: string) {
    setReviewOverrides((prev) => {
      const base = prev[mentorId] ?? mentors.find((m) => m.id === mentorId)!.review;
      return {
        ...prev,
        [mentorId]: { pendingItems: [], status: 'REJECTED', lastReviewAt: base.lastReviewAt, rejectReason: reason },
      };
    });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <GoldFlakes variant="light" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {/* 顶栏：与其他后台首页一致 */}
        <nav className="flex items-center justify-between gap-2" aria-label="面包屑">
          <p className="text-sm font-bold text-stone-700">
            <span>管理员</span>
            <span className="mx-1.5 text-stone-400">/</span>
            <span>导师管理</span>
          </p>
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2" aria-label="AI Career Companion 首页">
              <Image src="/icons/raw-logo.png" alt="AI Career Companion" width={40} height={40} priority className="h-10 w-10" />
              <span className="text-base font-medium text-stone-600">AI Career Companion</span>
            </Link>
            <Link
              href="/admin-console"
              className="rounded-lg border border-stone-300 bg-white/80 px-3 py-1 text-xs text-stone-600 hover:border-stone-400"
            >
              平台管理
            </Link>
            <button
              onClick={async () => {
                await signOut({ redirect: false });
                window.location.href = '/admin-console';
              }}
              className="rounded-lg border border-stone-300 bg-white/80 px-3 py-1 text-xs text-stone-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              退出登录
            </button>
          </div>
        </nav>

        {/* 子导航 */}
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-900/5">
          {([['list', '排序列表'], ['dialogue', '对话效果'], ['audience', '用户画像']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition-colors ${
                tab === k ? 'bg-[#55734B] text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {loading && !data && <ViewState loading />}
          {error && <ViewState error={error} />}

          {data && tab === 'list' && (
            <div className="space-y-3">
              {/* 排序选择 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-stone-400">排序：</span>
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSortKey(s.key)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      sortKey === s.key
                        ? 'bg-[#55734B] text-white'
                        : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
                <span className="ml-auto text-xs text-stone-400">
                  {['revenue', 'importedAt', 'duration', 'cards', 'review'].includes(sortKey) ? '从高到低' : '按字典序'}
                </span>
              </div>

              {sorted.map((m) => (
                <div key={m.id} className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin-console/mentors/${m.id}`}
                        className="text-base font-semibold text-stone-800 underline-offset-2 hover:underline"
                      >
                        {m.name}
                      </Link>
                      <span className="ml-2 text-sm text-stone-500">{m.chineseName}</span>
                      <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">{m.tier} 级</span>
                    </div>
                    <ReviewCell review={m.review} onOpen={() => setModalMentorId(m.id)} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-500 sm:grid-cols-5">
                    <span>订阅金额 <b className="text-stone-700">¥{m.revenueYuan.toLocaleString()}</b></span>
                    <span>入库 <b className="text-stone-700">{m.importedAt}</b></span>
                    <span>对话时长 <b className="text-stone-700">{Math.round(m.totalDurationMin / 60)} 小时</b></span>
                    <span>知识卡 <b className="text-stone-700">{m.knowledgeCards}</b> 张</span>
                    <span>订阅 <b className="text-stone-700">{m.subscribers}</b> 人</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && tab === 'dialogue' && (
            <div className="space-y-3">
              <p className="text-xs text-stone-400">
                各导师分身对话效果汇总 · 数据区间：{data.dateRange.start} 至 {data.dateRange.end}
              </p>
              <div className="overflow-x-auto rounded-2xl bg-white/90 p-2 shadow-sm ring-1 ring-stone-900/[0.06]">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-left text-xs text-stone-400">
                      <th className="px-2 py-2.5">导师</th>
                      <th className="px-2 py-2.5 text-right">帮助用户</th>
                      <th className="px-2 py-2.5 text-right">有效线程</th>
                      <th className="px-2 py-2.5 text-right">轮次</th>
                      <th className="px-2 py-2.5 text-right">免费轮次</th>
                      <th className="px-2 py-2.5 text-right">场均轮次</th>
                      <th className="px-2 py-2.5 text-right">赞/踩/举报</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...mentors].sort((a, b) => b.dialogue.rounds - a.dialogue.rounds).map((m) => (
                      <tr key={m.id} className="border-b border-stone-50 last:border-0">
                        <td className="px-2 py-2.5">
                          <Link href={`/admin-console/mentors/${m.id}`} className="font-medium text-stone-800 underline-offset-2 hover:underline">
                            {m.name}
                          </Link>
                          <span className="ml-1.5 text-xs text-stone-400">{m.chineseName}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right">{m.dialogue.helpedUsers}</td>
                        <td className="px-2 py-2.5 text-right">{m.dialogue.validSessions}</td>
                        <td className="px-2 py-2.5 text-right font-medium">{m.dialogue.rounds.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-stone-500">{m.dialogue.freeTrialRounds}</td>
                        <td className="px-2 py-2.5 text-right">{m.dialogue.avgRoundsPerSession}</td>
                        <td className="px-2 py-2.5 text-right text-stone-500">
                          <span className="text-emerald-600">{m.dialogue.likes}</span> / {m.dialogue.dislikes} / {m.dialogue.reports}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data && tab === 'audience' && (
            <div className="space-y-3">
              <p className="text-xs text-stone-400">
                各导师分身用户画像汇总 · 数据区间：{data.dateRange.start} 至 {data.dateRange.end}
              </p>
              <div className="overflow-x-auto rounded-2xl bg-white/90 p-2 shadow-sm ring-1 ring-stone-900/[0.06]">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-left text-xs text-stone-400">
                      <th className="px-2 py-2.5">导师</th>
                      <th className="px-2 py-2.5 text-right">总用户</th>
                      <th className="px-2 py-2.5">年龄 Top</th>
                      <th className="px-2 py-2.5">职业 Top</th>
                      <th className="px-2 py-2.5">RIASEC Top</th>
                      <th className="px-2 py-2.5">求助方向 Top</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...mentors].sort((a, b) => b.audience.totalUsers - a.audience.totalUsers).map((m) => (
                      <tr key={m.id} className="border-b border-stone-50 last:border-0">
                        <td className="px-2 py-2.5">
                          <Link href={`/admin-console/mentors/${m.id}`} className="font-medium text-stone-800 underline-offset-2 hover:underline">
                            {m.name}
                          </Link>
                          <span className="ml-1.5 text-xs text-stone-400">{m.chineseName}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right font-medium">{m.audience.totalUsers}</td>
                        <td className="px-2 py-2.5 text-stone-600">{m.audience.topAge}</td>
                        <td className="px-2 py-2.5 text-stone-600">{m.audience.topCareer}</td>
                        <td className="px-2 py-2.5 text-stone-600">{m.audience.topRiasec}</td>
                        <td className="px-2 py-2.5 text-stone-600">{m.audience.topHelp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {modalMentor && (
        <ReviewModal
          mentor={modalMentor}
          review={modalMentor.review}
          onClose={() => setModalMentorId(null)}
          onApprove={approve}
          onReject={reject}
        />
      )}

      <div className="relative z-10">
        <PaperCredits />
      </div>
    </div>
  );
}
