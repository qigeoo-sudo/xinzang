import { PwaInstall } from '@/components/pwa-install';

const copy = {
  zh: {
    name: 'AI Career Companion',
    slogan: '陪你一起\u00A0\u00A0见证成长',
    copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
  },
  en: {
    name: 'AI Career Companion',
    slogan: 'With you, as clarity grows.',
    copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
  },
};

/**
 * 黑卡压底（运通百夫长风格）：
 * 深底 + 金色烫字 + 微光边框，压在信笺（FeatureCards）底部，
 * 像 offer letter 最下面夹着一张高贵的黑卡。
 */
export function HomeFooter({
  lang,
  showInstall = false,
}: {
  lang: 'zh' | 'en';
  showInstall?: boolean;
}) {
  const t = copy[lang];
  return (
    <footer className="relative z-10 -mt-6 px-5 pb-10 md:-mt-8">
      <div className="mx-auto max-w-[840px]">
      {/* 黑卡宽度与三张信用卡单卡一致：md 以上 = (容器宽 - 2*gap) / 3，竖版全宽 */}
      <div
        className="animate-rise relative mx-auto w-full max-w-[335px]"
        style={{ animationDelay: '.25s' }}
      >
        {/* 圆角 + overflow-hidden 放在 card-black 自身：旋转时裁切跟着卡体走，
            彩虹条不会被外层静止容器裁切，视觉上与卡体绝对同步 */}
        <div className="card-black home-black-card relative flex aspect-[1.586/1] flex-col items-center justify-center gap-2 overflow-hidden rounded-[24px] px-4 py-5 text-center md:py-6">
        {showInstall && (
          <div className="mx-auto w-full max-w-[220px] -translate-y-[10px]">
            <PwaInstall lang={lang} />
          </div>
        )}
        <p className="text-foil font-mono text-[9px] font-medium uppercase tracking-masthead">
          {t.name}
        </p>
        <p className="text-foil font-serif text-[13px] font-bold md:text-[15px]">{t.slogan}</p>
        <p className="text-[9px] text-white/35">{t.copyright}</p>
        </div>
      </div>
      </div>
    </footer>
  );
}
