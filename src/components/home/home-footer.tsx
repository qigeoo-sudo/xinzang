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

export function HomeFooter({ lang }: { lang: 'zh' | 'en' }) {
  const t = copy[lang];
  return (
    <footer className="bg-brand-900 px-5 py-7 text-center">
      <p className="text-[13px] text-white/85">{t.name}</p>
      <p className="mt-1 text-[11px] text-white/75">{t.slogan}</p>
      <p className="mt-3.5 text-[10px] text-white/40">{t.copyright}</p>
    </footer>
  );
}
