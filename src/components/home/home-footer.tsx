import { PwaInstall } from '@/components/pwa-install';

const copy = {
  zh: {
    name: 'AI Career Companion',
    slogan: '陪你一起\u00A0\u00A0见证成长',
    copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
  },
  en: {
    name: 'AI Career Companion',
    slogan: 'Crescentem te aspicere, gaudium meum',
    copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
  },
};

/**
 * 黑卡压底（运通百夫长风格）：
 * 深底 + 金色烫字 + 微光边框，压在信笺（FeatureCards）底部，
 * 像 offer letter 最下面夹着一张高贵的黑卡。
 * letterOverlap=true 时用负 margin 压在信纸底部；
 * false（信纸已折叠）时取消负 margin，黑卡上移至原信纸上边缘位置。
 */
export function HomeFooter({
  lang,
  showInstall = false,
  letterOverlap = true,
}: {
  lang: 'zh' | 'en';
  showInstall?: boolean;
  letterOverlap?: boolean;
}) {
  const t = copy[lang];
  return (
    <footer
      className={`relative z-10 px-5 pb-10 ${
        letterOverlap ? '-mt-6 md:-mt-8' : 'mt-0'
      }`}
    >
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
        <p
          className={`text-foil font-serif font-bold ${
            lang === 'en' ? 'text-[10.5px] leading-tight md:text-[12px]' : 'text-[13px] md:text-[15px]'
          }`}
        >
          {t.slogan}
        </p>
        <p className="text-[9px] text-white/35">{t.copyright}</p>
        </div>
      </div>
      </div>
    </footer>
  );
}
