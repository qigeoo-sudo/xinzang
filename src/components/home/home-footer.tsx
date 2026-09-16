import { PwaInstall } from '@/components/pwa-install';

const copy = {
  zh: {
    name: 'AI Career Companion',
    slogan: '陪你一起，见证成长。',
    copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
  },
  en: {
    name: 'AI Career Companion',
    slogan: 'With you, as clarity grows.',
    copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
  },
};

export function HomeFooter({
  lang,
  showInstall = false,
}: {
  lang: 'zh' | 'en';
  showInstall?: boolean;
}) {
  const t = copy[lang];
  return (
    <footer className="px-5 pb-2 pt-14 md:pt-16">
      <div className="mx-auto max-w-[840px] overflow-hidden rounded-[24px]">
        {/* 汽水渐变上沿条：橙 → 珊瑚 → 鼠尾草 */}
        <div
          aria-hidden
          className="h-1.5"
          style={{
            backgroundImage:
              'linear-gradient(90deg, #F6A44C 0%, #EC6070 38%, #7A9E6E 72%, #2C3E5C 100%)',
          }}
        />
        <div className="bg-ink px-5 py-10 text-center">
          {showInstall && (
            <div className="mx-auto mb-7 max-w-xs">
              <PwaInstall lang={lang} />
            </div>
          )}
          <p className="font-mono text-[10px] font-medium uppercase tracking-masthead text-white/45">
            {t.name}
          </p>
          <p className="mt-2.5 font-serif text-[15px] font-bold text-white/90">{t.slogan}</p>
          <p className="mt-4 text-[10px] text-white/35">{t.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
