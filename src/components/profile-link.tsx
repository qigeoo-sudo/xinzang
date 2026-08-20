'use client';

import Link from 'next/link';

/**
 * "我的档案"按钮 — 客户端组件
 * 档案始终可访问（AI 职导与导师分身已改为平行关系，不再要求先完成访谈）
 */
export function ProfileLink() {
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
