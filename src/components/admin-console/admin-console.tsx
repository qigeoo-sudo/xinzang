'use client';

/**
 * 管理员数据后台 app shell — 与导师真身后台同语言：面包屑身份 + 模块导航。
 * 底托：肉粉底 + 金屑（GoldFlakes）+ PaperCredits 版权。
 * 全局数据区间：起止日期均可编辑，结束日默认今天；最长跨度 3 年。
 * demo 阶段各视图为固定区间快照，真实接口接入后按区间查询。
 */
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { OverviewView } from './overview-view';
import { PagesView } from './pages-view';
import { CtasView } from './ctas-view';
import { JourneysView } from './journeys-view';
import { RetentionView } from './retention-view';
import { MentorsView } from './mentors-view';
import { UsersView } from './users-view';
import { ChannelsView } from './channels-view';
import { GoldFlakes, PaperCredits } from '@/components/page-shell';

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'pages', label: '页面' },
  { key: 'ctas', label: '按钮' },
  { key: 'journeys', label: '行为链' },
  { key: 'retention', label: '留存' },
  { key: 'mentors', label: '导师' },
  { key: 'users', label: '用户' },
  { key: 'channels', label: '渠道' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const DEMO_START = '2026-07-09';
const MAX_SPAN_MS = 3 * 365.25 * 86_400_000;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function AdminConsole({ accountName }: { accountName: string }) {
  const [tab, setTab] = useState<TabKey>('overview');
  // 已生效的合法区间；输入框临时值允许非法态（仅提示，不生效）
  const [range, setRange] = useState({ start: DEMO_START, end: todayStr() });
  const [draft, setDraft] = useState(range);
  const [rangeError, setRangeError] = useState('');

  function commit(next: { start: string; end: string }) {
    if (!next.start || !next.end) return; // 留空时等用户填完
    if (next.start > next.end) {
      setRangeError('开始日期不能晚于结束日期');
      return;
    }
    if (new Date(`${next.end}T00:00:00`).getTime() - new Date(`${next.start}T00:00:00`).getTime() > MAX_SPAN_MS) {
      setRangeError('区间跨度最长为 3 年');
      return;
    }
    setRangeError('');
    setRange(next);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <GoldFlakes variant="light" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {/* 面包屑：当前身份 + 右侧 logo + 渠道管理入口 + 退出 */}
        <nav className="flex items-center justify-between gap-2" aria-label="面包屑">
          <p className="text-sm font-bold text-stone-700">
            <span>{accountName}</span>
            <span className="mx-1.5 text-stone-400">/</span>
            <span>平台数据后台</span>
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2"
              aria-label="AI Career Companion 首页"
            >
              <Image
                src="/icons/raw-logo.png"
                alt="AI Career Companion"
                width={40}
                height={40}
                priority
                className="h-10 w-10"
              />
              <span className="hidden text-base font-medium text-stone-600 sm:inline">AI Career Companion</span>
            </Link>
            <Link
              href="/admin-console/mentors"
              className="rounded-lg border border-stone-300 bg-white/80 px-3 py-1 text-xs text-stone-600 hover:border-stone-400"
            >
              导师管理
            </Link>
            <Link
              href="/admin/channels"
              className="rounded-lg border border-stone-300 bg-white/80 px-3 py-1 text-xs text-stone-600 hover:border-stone-400"
            >
              渠道管理
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

        {/* 模块导航 */}
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-900/5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition-colors ${
                tab === t.key
                  ? 'bg-[#55734B] text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 全局数据区间：起止均可编辑，结束日默认今天，最长跨度 3 年 */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 ring-1 ring-stone-900/5">
          <span className="text-xs text-stone-400">数据区间</span>
          <input
            type="date"
            value={draft.start}
            max={draft.end || todayStr()}
            onChange={(e) => { const next = { ...draft, start: e.target.value }; setDraft(next); commit(next); }}
            aria-label="开始日期"
            className={`rounded-lg border px-2 py-1 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-[#55734B]/30 ${
              rangeError ? 'border-rose-300 bg-rose-50' : 'border-stone-200 bg-white'
            }`}
          />
          <span className="text-xs text-stone-400">至</span>
          <input
            type="date"
            value={draft.end}
            max={todayStr()}
            onChange={(e) => { const next = { ...draft, end: e.target.value }; setDraft(next); commit(next); }}
            aria-label="结束日期"
            className={`rounded-lg border px-2 py-1 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-[#55734B]/30 ${
              rangeError ? 'border-rose-300 bg-rose-50' : 'border-stone-200 bg-white'
            }`}
          />
          {rangeError
            ? <span className="text-xs text-rose-600">{rangeError}</span>
            : <span className="text-xs text-stone-400">已生效：{range.start} 至 {range.end} · demo 为固定区间快照</span>}
        </div>

        {/* 视图 */}
        <div className="mt-4">
          {tab === 'overview' && <OverviewView />}
          {tab === 'pages' && <PagesView />}
          {tab === 'ctas' && <CtasView />}
          {tab === 'journeys' && <JourneysView />}
          {tab === 'retention' && <RetentionView />}
          {tab === 'mentors' && <MentorsView />}
          {tab === 'users' && <UsersView />}
          {tab === 'channels' && <ChannelsView />}
        </div>
      </div>

      <div className="relative z-10">
        <PaperCredits />
      </div>
    </div>
  );
}
