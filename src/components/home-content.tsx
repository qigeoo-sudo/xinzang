'use client';

import { useLanguage } from '@/components/language-context';
import { LanguageToggle } from '@/components/language-toggle';
import { EntranceCards } from '@/components/home/entrance-cards';
import { FeatureCards } from '@/components/home/feature-cards';
import { HomeFooter } from '@/components/home/home-footer';

const copy = {
  zh: {
    sloganA: '陪你',
    sloganAccent: '榨出',
    sloganB: '最爱的职业',
    sub: '不管你是迷茫、还是有了方向',
  },
  en: {
    sloganA: 'Squeeze Out the',
    sloganAccent: 'Career',
    sloganB: 'You Love',
    sub: 'Whether you are still figuring it out, or already have a direction',
  },
};

export function HomeContent() {
  const { lang, mounted } = useLanguage();
  const tr = mounted ? copy[lang] : copy.zh;
  const uiLang = mounted ? lang : 'zh';

  return (
    <main className="flex-1">
      <LanguageToggle />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-bg px-5 pb-10 pt-14 text-center">
        {/* 径向光晕 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 25% 25%, rgba(245,166,35,.06) 0, transparent 50%), radial-gradient(ellipse at 75% 75%, rgba(122,158,110,.06) 0, transparent 50%)',
          }}
          aria-hidden
        />
        {/* 椭圆装饰 */}
        <svg
          className="pointer-events-none absolute left-1/2 top-0 h-[280px] w-[280px] -translate-x-1/2 opacity-[.12]"
          viewBox="0 0 280 280"
          aria-hidden
        >
          <g transform="translate(140,140)" opacity=".5">
            <ellipse cx="0" cy="0" rx="120" ry="60" fill="none" stroke="#F5A623" strokeWidth="1" />
            <ellipse cx="0" cy="0" rx="80" ry="40" fill="none" stroke="#7A9E6E" strokeWidth=".8" />
            <ellipse cx="0" cy="0" rx="40" ry="20" fill="none" stroke="#F8C741" strokeWidth=".6" />
          </g>
        </svg>

        <h1 className="relative font-serif text-[clamp(26px,6.5vw,40px)] font-black leading-[1.3] tracking-[-0.02em] text-ink">
          {tr.sloganA}
          <span className="bg-gradient-to-br from-brand-500 to-gold-400 bg-clip-text text-transparent">
            {tr.sloganAccent}
          </span>
          {tr.sloganB}
        </h1>
        <p className="relative mt-3 text-sm text-muted">{tr.sub}</p>
      </section>

      {/* 三张入口卡 */}
      <div className="-mt-2 bg-bg">
        <EntranceCards lang={uiLang} />
      </div>

      {/* 为什么选择榨职机 */}
      <FeatureCards lang={uiLang} />

      {/* 页脚（首页提供 PWA 安装入口） */}
      <HomeFooter lang={uiLang} showInstall />
    </main>
  );
}
