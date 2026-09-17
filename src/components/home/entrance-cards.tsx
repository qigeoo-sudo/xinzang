'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * 渲染卡面引用语：
 * - 中文：按 \n 拆为两行，第二行缩进一个汉字宽度（1em）
 * - 英文：单行直接输出
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
    go: '搜索',
  },
  en: {
    quote1: '"Not sure about my career direction — give me suggestions"',
    action1: 'Take the Interest Assessment',
    quote2: '"Let me browse mentors first — I may find my direction"',
    action2: 'See All Mentor Personas',
    quote3: '"I know my direction — match me with mentors directly"',
    placeholder: 'Keywords, e.g. strategy consulting, investment',
    go: 'Search',
  },
};

/**
 * 首页三个入口 = 三张信用卡（杏金 / 鼠尾草绿 / 珊瑚）。
 * 2.5D 金属浮雕：多段渐变模拟反光带，inset 高光模拟烫金凸起，
 * 功能区做成"开窗"凹槽（card-cutout）——像信用卡签名条下的白底区。
 * 微微旋转、错落铺开；hover 时回正 + 上浮 4px，像被你拈起来端详。
 */
export function EntranceCards({ lang }: { lang: 'zh' | 'en' }) {
  const router = useRouter();
  const t = copy[lang];
  const [keyword, setKeyword] = useState('');

  const goSearch = () => {
    const q = keyword.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  // 彩卡静止水平放置，无初始旋转、无 hover 动效

  return (
    <section className="mx-auto max-w-[840px] px-5 pb-4 pt-4">
      <div className="grid grid-cols-1 justify-items-center gap-5 md:grid-cols-[repeat(3,minmax(0,335px))] md:justify-center">
        {/* 卡 1：搜索（杏金） */}
        <div className="w-full max-w-[335px] md:mt-5">
          <div
            className="card-metal card-gold flex aspect-[1.586/1] flex-col p-4 md:p-5"
          >
            <span className="text-foil-light font-mono text-[10px] font-medium uppercase tracking-masthead">
              01&nbsp;&nbsp;Search
            </span>
            <h2 className="text-foil-light mt-3 font-serif text-[18px] font-bold leading-[1.55]">
              <Quote text={t.quote3} />
            </h2>
            <div className="card-cutout mt-auto px-3 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') goSearch();
                  }}
                  className="min-w-0 flex-1 border-b-2 border-ink/25 bg-transparent py-1 text-[13px] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-brand-500"
                  placeholder={t.placeholder}
                  aria-label={t.placeholder}
                />
                <button
                  type="button"
                  onClick={goSearch}
                  className="flex shrink-0 items-center gap-1 pb-0.5 text-[13px] font-bold text-ink transition-opacity hover:opacity-60 active:scale-95"
                  aria-label={t.go}
                >
                  {t.go}
                  <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 卡 2：导师（鼠尾草绿） */}
        <div className="w-full max-w-[335px]">
          <Link
            href="/mentors"
            className="card-metal card-sage group block flex aspect-[1.586/1] flex-col p-4 md:p-5"
          >
            <span className="text-foil-light font-mono text-[10px] font-medium uppercase tracking-masthead">
              02&nbsp;&nbsp;MENTOR AVATAR<span style={{ textTransform: 'lowercase' }}>s</span>
            </span>
            <h2 className="text-foil-light mt-3 font-serif text-[18px] font-bold leading-[1.55]">
              <Quote text={t.quote2} />
            </h2>
            <div className="card-cutout mt-auto px-3 py-2.5">
              <span className="inline-flex items-center border-b-2 border-brand-500 pb-0.5 text-[13px] font-bold text-ink transition-colors group-hover:border-ink">
                {t.action2}
                <span aria-hidden className="ml-1.5 transition-transform group-hover:translate-x-1">→</span>
              </span>
            </div>
          </Link>
        </div>

        {/* 卡 3：测评（珊瑚） */}
        <div className="w-full max-w-[335px] md:mt-8">
          <Link
            href="/assessment"
            className="card-metal card-coral group block flex aspect-[1.586/1] flex-col p-4 md:p-5"
          >
            <span className="text-foil-light font-mono text-[10px] font-medium uppercase tracking-masthead">
              03&nbsp;&nbsp;CAREER INTEREST TEST
            </span>
            <h2 className="text-foil-light mt-3 font-serif text-[18px] font-bold leading-[1.55]">
              <Quote text={t.quote1} />
            </h2>
            <div className="card-cutout mt-auto px-3 py-2.5">
              <span className="inline-flex items-center border-b-2 border-brand-500 pb-0.5 text-[13px] font-bold text-ink transition-colors group-hover:border-ink">
                {t.action1}
                <span aria-hidden className="ml-1.5 transition-transform group-hover:translate-x-1">→</span>
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
