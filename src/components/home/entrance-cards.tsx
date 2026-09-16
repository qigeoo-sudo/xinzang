'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * 渲染入口卡片的引用语：
 * - 中文：按 \n 拆为两行，第二行缩进一个汉字宽度（1em）
 * - 英文：单行直接输出
 * 左引号在第一行首，右引号在第二行尾。
 */
function Quote({ text }: { text: string }) {
  const lines = text.split('\n');
  if (lines.length <= 1) return <>{text}</>;
  return (
    <>
      {lines[0]}
      <br />
      <span className="pl-[1em]">{lines.slice(1).join('\n')}</span>
    </>
  );
}

const copy = {
  zh: {
    quote1: '“我不清楚我的职业方向，\n请给我建议”',
    action1: '做职业兴趣测试',
    quote2: '“我先浏览一下导师，\n可能会发现我要的方向”',
    action2: '看所有导师分身',
    quote3: '“我清楚我的职业方向，\n直接匹配导师”',
    placeholder: '输入关键词，如：战略咨询，投融资',
  },
  en: {
    quote1: '"Not sure about my career direction — give me suggestions"',
    action1: 'Take the Interest Assessment',
    quote2: '"Let me browse mentors first — I may find my direction"',
    action2: 'See All Mentor Personas',
    quote3: '"I know my direction — match me with mentors directly"',
    placeholder: 'Keywords, e.g. strategy consulting, investment',
  },
};

export function EntranceCards({ lang }: { lang: 'zh' | 'en' }) {
  const router = useRouter();
  const t = copy[lang];
  const [keyword, setKeyword] = useState('');

  const goSearch = () => {
    const q = keyword.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="mx-auto grid max-w-[840px] grid-cols-1 gap-4 px-4 pb-10 md:grid-cols-2 md:px-5 md:pb-12">
      {/* 卡 1：关键词匹配导师 */}
      <div className="animate-card-in rounded-[20px] border border-brand-500/15 bg-gradient-to-br from-brand-50 to-beige p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(44,62,92,0.08)] active:scale-[.99] md:p-7">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand-500">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M9 3v18" />
            <path d="M15 3v18" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
          </svg>
        </div>
        <h2 className="mb-5 font-serif text-[17px] font-bold leading-relaxed text-ink md:text-xl">
          <Quote text={t.quote3} />
        </h2>
        <div className="flex w-full items-stretch overflow-hidden rounded-[10px] border-2 border-coral-300 bg-coral-50 transition-all focus-within:border-brand-500 md:max-w-md">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goSearch();
            }}
            className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[13px] font-medium text-coral-800 outline-none placeholder:font-normal placeholder:text-coral-300"
            placeholder={t.placeholder}
            aria-label={t.placeholder}
          />
          <button
            type="button"
            onClick={goSearch}
            className="flex shrink-0 items-center justify-center bg-brand-500 px-3.5 text-base font-bold text-white transition-all hover:bg-brand-600 active:scale-95"
            aria-label="search"
          >
            →
          </button>
        </div>
      </div>

      {/* 卡 2：所有导师分身 */}
      <div
        className="animate-card-in rounded-[20px] border border-sage-400/15 bg-gradient-to-br from-sage-50 to-[#E8F0E5] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(44,62,92,0.08)] active:scale-[.99] md:p-7"
        style={{ animationDelay: '.1s' }}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-sage-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <h2 className="mb-5 font-serif text-[17px] font-bold leading-relaxed text-ink md:text-xl">
          <Quote text={t.quote2} />
        </h2>
        <Link
          href="/mentors"
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-sage-400 px-[18px] py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-sage-500 active:scale-[.97]"
        >
          {t.action2}
          <span aria-hidden>→</span>
        </Link>
      </div>

      {/* 卡 3：职业兴趣测试 */}
      <div
        className="animate-card-in rounded-[20px] border border-gold-400/15 bg-gradient-to-br from-gold-50 to-gold-100 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(44,62,92,0.08)] active:scale-[.99] md:col-span-2 md:p-7"
        style={{ animationDelay: '.2s' }}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-gold-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6" />
            <path d="M9 17h4" />
          </svg>
        </div>
        <h2 className="mb-5 font-serif text-[17px] font-bold leading-relaxed text-ink md:text-xl">
          <Quote text={t.quote1} />
        </h2>
        <Link
          href="/assessment"
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-gold-400 px-[18px] py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-gold-600 active:scale-[.97]"
        >
          {t.action1}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
