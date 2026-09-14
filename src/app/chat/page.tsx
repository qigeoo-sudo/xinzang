'use client';

import Link from 'next/link';
import { Header } from '@/components/header';

export default function ChatPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container pt-14">
        <div className="max-w-md mx-auto mt-20 text-center">
          <h1 className="text-xl font-semibold mb-4">榨职机访谈已升级</h1>
          <p className="text-sm text-muted leading-relaxed mb-8">
            个人信息现在可以直接在「个人档案」中填写和修改，
            职业上的困惑也可以随时找行业导师分身聊聊。
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/dashboard/profile"
              className="px-5 py-2.5 rounded-full text-sm text-white"
              style={{ backgroundColor: '#6B8E5E' }}
            >
              去个人档案
            </Link>
            <Link
              href="/mentors"
              className="px-5 py-2.5 rounded-full text-sm border"
              style={{ borderColor: '#6B8E5E', color: '#6B8E5E' }}
            >
              找导师分身
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
