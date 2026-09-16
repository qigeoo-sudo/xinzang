'use client';

import Image from 'next/image';
import { useLanguage } from '@/components/language-context';
import { LanguageToggle } from '@/components/language-toggle';
import { EntranceCards } from '@/components/home/entrance-cards';
import { FeatureCards } from '@/components/home/feature-cards';
import { MentorPreview } from '@/components/home/mentor-preview';
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
      {/* 封面：渐变页头直接接壤导航栏 + 榨汁机图腾破框探出 */}
      <section className="relative">
        {/* 语言切换：白色圆形气泡，页头右上角（移动端位于"我的档案"入口下方） */}
        <div className="absolute right-4 top-3.5 z-20 md:right-8 md:top-5">
          <LanguageToggle />
        </div>

        {/* 渐变底层（装饰可裁切，图腾不裁切） */}
        <div className="cover-gradient absolute inset-0 overflow-hidden rounded-b-[36px]">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-4 -top-8 hidden select-none font-serif text-[240px] font-bold leading-none text-white/[0.13] md:block"
          >
            榨
          </span>
          <span aria-hidden className="absolute left-[8%] top-[16%] text-lg text-white/85">✦</span>
          <span aria-hidden className="absolute bottom-[34%] left-[42%] text-base text-white/70">✦</span>
          <span aria-hidden className="absolute right-[34%] top-[12%] text-[10px] text-white/60">✦</span>
        </div>

        {/* 内容层 */}
        <div className="relative mx-auto max-w-[840px] px-5 pb-8 pt-12 md:pb-12 md:pt-16">
          <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between md:gap-10">
            <div className="max-w-[560px]">
              <span
                className="block h-[3px] w-10 rounded-full bg-white/90"
                aria-hidden
              />
              <h1 className="mt-6 font-serif text-[clamp(32px,8.5vw,54px)] font-bold leading-[1.22] tracking-[-0.02em] text-[#FFF9F2]">
                {tr.sloganA}
                <span className="mx-1 inline-block rounded-[10px] bg-[#FFF9F2] px-2.5 leading-tight text-ink">
                  {tr.sloganAccent}
                </span>
                {tr.sloganB}
              </h1>
              <p className="mt-5 max-w-[360px] text-sm leading-relaxed text-white/85 md:text-[15px]">
                {tr.sub}
              </p>
            </div>

            {/* 图腾：榨汁机，破框探出到杏红底上。白框=蒙版容器，logo 铺满并放大，溢出部分被裁掉；
                最底枚金币用原图抠出的完整贴片叠在框外，还原"垂出白框"的原设计 */}
            <div className="animate-float relative z-10 -mb-[56px] shrink-0 self-center md:-mb-[80px] md:self-end md:pr-4">
              <div className="h-[170px] w-[170px] overflow-hidden rounded-[34px] shadow-[0_16px_40px_rgba(44,62,92,0.28)] ring-[3px] ring-white/70 md:h-[240px] md:w-[240px] md:rounded-[48px]">
                <Image
                  src="/icons/icon-block-1024.png"
                  alt="榨职机"
                  width={220}
                  height={220}
                  priority
                  className="h-full w-full scale-[1.18] object-cover"
                />
              </div>
              <Image
                src="/icons/icon-coin.png"
                alt=""
                width={134}
                height={100}
                aria-hidden
                priority
                className="absolute left-[34.4%] top-[98%] w-[10.6%] drop-shadow-[0_4px_8px_rgba(44,62,92,0.22)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 本期目录 */}
      <EntranceCards lang={uiLang} />

      {/* 本期导师 */}
      <MentorPreview lang={uiLang} />

      {/* 立场与事实 */}
      <FeatureCards lang={uiLang} />

      {/* 版权页（首页提供 PWA 安装入口） */}
      <HomeFooter lang={uiLang} showInstall />
    </main>
  );
}
