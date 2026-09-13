import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';
import { MentorCard } from '@/components/mentor-card';
import { searchMentors } from '@/lib/search';

export const metadata: Metadata = {
  title: '搜索导师分身 - 榨职机',
};

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q || '').trim();
  const hits = q ? await searchMentors(q) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <div className="page-container">
        {/* 标题 */}
        <div className="mb-5">
          <h1 className="mb-2 text-xl font-bold text-ink">搜索导师分身</h1>
          <p className="text-sm leading-relaxed text-muted">
            输入关键词，从已上线导师分身的知识卡、标签和介绍里，找匹配度最高的前 5 位
          </p>
        </div>

        {/* 搜索框（GET 表单，改词直接重新搜） */}
        <form action="/search" method="get" className="mb-6 flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            maxLength={40}
            placeholder="输入关键词，如：战略咨询，投融资，面试"
            className="input-field flex-1"
            aria-label="搜索关键词"
          />
          <button
            type="submit"
            className="shrink-0 rounded-[10px] bg-brand-500 px-5 text-sm font-bold text-white transition-all hover:bg-brand-600 active:scale-[.97]"
          >
            搜索
          </button>
        </form>

        {!q && (
          <div className="rounded-2xl border border-rule bg-beige/50 p-8 text-center">
            <p className="text-sm text-muted">
              先在上面输入你想聊的方向或问题
            </p>
          </div>
        )}

        {q && hits.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted">
              「<span className="font-semibold text-ink">{q}</span>」
              匹配度最高的 {hits.length} 位导师分身
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {hits.map((hit) => (
                <MentorCard
                  key={hit.mentor.id}
                  mentor={hit.mentor}
                  reasons={hit.reasons}
                />
              ))}
            </div>
          </>
        )}

        {q && hits.length === 0 && (
          <div className="rounded-2xl border border-rule bg-white/80 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-beige">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5A6B7E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <p className="mb-1.5 text-sm font-semibold text-ink">
              没有找到与「{q}」直接匹配的导师分身
            </p>
            <p className="mx-auto mb-6 max-w-sm text-xs leading-6 text-muted">
              我们不想硬凑一位给你。不妨先去全部导师分身那边转一转，看看谁跟你的方向更有缘，或者换个更具体的关键词再搜一次。
            </p>
            <div className="flex justify-center gap-3">
              <Link
                href="/"
                className="rounded-[10px] px-5 py-2.5 text-sm font-semibold text-muted"
                style={{ background: 'rgba(90,107,126,0.08)' }}
              >
                返回首页
              </Link>
              <Link
                href="/mentors"
                className="rounded-[10px] bg-sage-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-sage-500 active:scale-[.97]"
              >
                去看所有导师分身
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
