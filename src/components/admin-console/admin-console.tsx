'use client';

/**
 * 管理员数据后台 app shell — 与导师真身后台同语言：面包屑身份 + 模块导航。
 * 底托：肉粉底 + 金屑（GoldFlakes）+ PaperCredits 版权。
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
import { GoldFlakes, PaperCredits } from '@/components/page-shell';

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'pages', label: '页面' },
  { key: 'ctas', label: '按钮' },
  { key: 'journeys', label: '行为链' },
  { key: 'retention', label: '留存' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function AdminConsole({ accountName }: { accountName: string }) {
  const [tab, setTab] = useState<TabKey>('overview');

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
              <span className="text-base font-medium text-stone-600">AI Career Companion</span>
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

        {/* 视图 */}
        <div className="mt-4">
          {tab === 'overview' && <OverviewView />}
          {tab === 'pages' && <PagesView />}
          {tab === 'ctas' && <CtasView />}
          {tab === 'journeys' && <JourneysView />}
          {tab === 'retention' && <RetentionView />}
        </div>
      </div>

      <div className="relative z-10">
        <PaperCredits />
      </div>
    </div>
  );
}
