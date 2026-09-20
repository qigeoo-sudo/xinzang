'use client';

import { useState } from 'react';
import Image from 'next/image';
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
  // 信纸显示/隐藏：隐藏时黑卡上移至原信纸上边缘位置
  const [letterVisible, setLetterVisible] = useState(true);

  return (
    <main className="flex-1">
      {/* 封面：渐变页头直接接壤导航栏 + 榨汁机图腾破框探出 */}
      <section className="relative z-10">
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
        <div className="relative mx-auto max-w-[840px] px-5 pb-6 pt-8 md:pb-12 md:pt-12">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between md:gap-10">
            {/* 文字列：md 以上设最小高度，确保中英文切换时页头高度一致
                （中文 h1 最大 44px，英文收窄后更矮，用 min-h 把英文撑到与中文等高） */}
            <div className="max-w-[560px] md:min-h-[128px]">
              <span
                className="block h-[3px] w-10 rounded-full bg-white/90"
                aria-hidden
              />
              <h1
                className={`mt-6 font-serif font-bold leading-[1.22] tracking-[-0.02em] text-[#FFF9F2] ${
                  uiLang === 'zh'
                    ? // 中文单行铺满：随屏宽缩放，绝不换行
                      'whitespace-nowrap text-[clamp(22px,7vw,44px)]'
                    : // 英文：横屏单行不换行，字号收窄避免折行撑高页头
                      'text-[clamp(17px,4.2vw,28px)] md:whitespace-nowrap'
                }`}
              >
                {tr.sloganA}
                <span className="mx-1 inline-block rounded-[10px] bg-[#FFF9F2] px-2 leading-tight text-ink">
                  {tr.sloganAccent}
                </span>
                {tr.sloganB}
              </h1>
              <p className="mt-5 max-w-[360px] text-[12px] leading-relaxed text-white/85 md:max-w-[520px] md:text-[13px]">
                {tr.sub}
              </p>
            </div>

            {/* 图腾：榨汁机，破框探出到杏红底上。白框=蒙版容器，logo 铺满并放大，溢出部分被裁掉；
                最底枚金币用原图抠出的完整贴片叠在框外，还原"垂出白框"的原设计 */}
            <div className="animate-float relative z-10 -mb-[56px] shrink-0 self-center md:-mb-[56px] md:self-end md:pr-4">
              <div className="h-[120px] w-[120px] overflow-hidden rounded-[24px] shadow-[0_16px_40px_rgba(44,62,92,0.28)] ring-[3px] ring-white/70 md:h-[160px] md:w-[160px] md:rounded-[32px]">
                <Image
                  src="/icons/icon-block-1024.png"
                  alt="榨职机"
                  width={160}
                  height={160}
                  priority
                  className="h-full w-full scale-[1.18] object-cover"
                />
              </div>
              <Image
                src="/icons/icon-coin.png"
                alt=""
                width={90}
                height={67}
                aria-hidden
                priority
                className="absolute left-[34.4%] top-[98%] w-[10.6%] drop-shadow-[0_4px_8px_rgba(44,62,92,0.22)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 机身灰蓝展台：向上吃掉页头 36px 圆角高度（页头 z-10 压在上层），
          金属卡 / 信纸 / 金币都压在这层丝绒上 */}
      <div className="home-backdrop relative z-0 -mt-[36px] overflow-hidden">
        {/* 金币点缀（2枚）+ 四芒星光：全页 4 颗 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <Image
            src="/icons/icon-coin.png"
            alt=""
            width={32}
            height={24}
            className="coin-debris"
            style={{ left: '3%', top: '5%', transform: 'rotate(-10deg)' }}
          />
          <Image
            src="/icons/icon-coin.png"
            alt=""
            width={28}
            height={21}
            className="coin-debris"
            style={{ right: '3%', top: '60%', transform: 'rotate(14deg)' }}
          />
          <span className="star-spark absolute" style={{ left: '9.5%', top: '3.5%', fontSize: 12 }}>
            ✦
          </span>
          <span className="star-spark absolute" style={{ right: '22%', top: '18%', fontSize: 13 }}>
            ✦
          </span>
          <span className="star-spark absolute" style={{ left: '9%', top: '46.5%', fontSize: 10 }}>
            ✦
          </span>
          <span className="star-spark absolute" style={{ right: '8.5%', top: '58%', fontSize: 12 }}>
            ✦
          </span>
        </div>

        <div className="relative z-10">
          {/* 页头标语（pt 含灰蓝上移的 36px 补偿） */}
          <p className="masthead-label masthead-home text-center pt-[68px] pb-4 text-white/80">
            navigate around any singularity, shape your future
          </p>

          {/* 三张金属信用卡入口 */}
          <EntranceCards lang={uiLang} />

          {/* Offer letter：机构抬头 + 正文 + 又及广告 + 三张卖点卡 + 签名 */}
          <FeatureCards lang={uiLang} visible={letterVisible} onToggle={() => setLetterVisible((v) => !v)} />

          {/* 黑卡压底（首页提供 PWA 安装入口）；信纸隐藏时取消负边距，上移至原信纸上边缘 */}
          <HomeFooter lang={uiLang} showInstall letterOverlap={letterVisible} />
        </div>
      </div>
    </main>
  );
}
