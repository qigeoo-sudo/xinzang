'use client';

/**
 * 导师真身后台 app shell — 面包屑身份 + 模块导航。
 * 底托：肉粉底 + 金屑（GoldFlakes）+ PaperCredits 版权（logo/slogan/copyright）。
 */
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { OverviewView } from './overview-view';
import { ConversationsView } from './conversations-view';
import { AudienceView } from './audience-view';
import { SubmissionsView } from './submissions-view';
import { AccountView } from './account-view';
import { GoldFlakes, PaperCredits } from '@/components/page-shell';

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'conversations', label: '对话效果' },
  { key: 'audience', label: '用户画像' },
  { key: 'submissions', label: '我的提交' },
  { key: 'account', label: '账号安全' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface Props {
  mentorName: string;
  accountName: string;
  lastLoginAt: string | null;
  loginCount: number;
}

export function MentorConsole({ mentorName, accountName, lastLoginAt, loginCount }: Props) {
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      {/* 洒金屑：肉粉底上飘金币贴片 + 四芒星光，每次加载位置不同 */}
      <GoldFlakes variant="light" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {/* 面包屑：显示当前身份（加大加粗）+ 右侧 logo/slogan + 退出按钮 */}
        <nav className="flex items-center justify-between gap-2" aria-label="面包屑">
          <p className="text-sm font-bold text-stone-700">
            <span>{mentorName}</span>
            <span className="mx-1.5 text-stone-400">/</span>
            <span>导师真身后台</span>
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
            <button
              onClick={async () => {
                await signOut({ redirect: false });
                // 退出后留在 mentor-console，未登录会被服务端拦截到登录 gate
                window.location.href = '/mentor-console';
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
          {tab === 'conversations' && <ConversationsView />}
          {tab === 'audience' && <AudienceView />}
          {tab === 'submissions' && <SubmissionsView />}
          {tab === 'account' && (
            <AccountView
              mentorName={mentorName}
              accountName={accountName}
              lastLoginAt={lastLoginAt}
              loginCount={loginCount}
            />
          )}
        </div>
      </div>

      {/* 底托：logo + slogan + copyright（深字版适配肉粉底） */}
      <div className="relative z-10">
        <PaperCredits />
      </div>
    </div>
  );
}
