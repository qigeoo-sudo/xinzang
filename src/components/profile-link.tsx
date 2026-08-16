'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AccessBlocker } from '@/components/mentor-access-blocker';

/**
 * "我的档案"按钮 — 客户端组件
 * 问卷未完成时点击弹出拦截提示框，完成后正常跳转
 */
export function ProfileLink({ interviewCompleted }: { interviewCompleted: boolean }) {
  const [showBlocker, setShowBlocker] = useState(false);

  if (interviewCompleted) {
    // 问卷已完成 — 正常链接
    return (
      <Link
        href="/dashboard/profile"
        className="card card-hover flex flex-col items-center gap-2 py-4"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5B7C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="text-sm text-brand-900">我的档案</span>
      </Link>
    );
  }

  // 问卷未完成 — 点击弹出提示框
  return (
    <>
      <button
        type="button"
        onClick={() => setShowBlocker(true)}
        className="card card-hover flex flex-col items-center gap-2 py-4 w-full"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5B7C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="text-sm text-brand-900">我的档案</span>
      </button>
      {showBlocker && (
        <AccessBlocker message={'访谈交流完成后才\n能查看个人档案'} />
      )}
    </>
  );
}
