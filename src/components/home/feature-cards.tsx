const copy = {
  zh: {
    title: '为什么选择榨职机',
    items: [
      {
        cls: 'bg-brand-50 text-brand-500',
        title: '智能榨职',
        desc: 'AI榨职机通过和你进行问卷访谈，让AI导师能更有效率帮到你，同时它自己也在升级，力争获得超榨导师称号。',
        icon: (
          <>
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
          </>
        ),
      },
      {
        cls: 'bg-sage-50 text-sage-500',
        title: '真实身份',
        desc: '行业导师 AI 分身，拥有一线HR大咖及其他行业大咖的真实访谈知识库。理解你的状况，回答你的困惑，陪伴你的成长。',
        icon: (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        ),
      },
      {
        cls: 'bg-gold-50 text-gold-600',
        title: '科学定制',
        desc: '采用国际标准的霍兰德职业兴趣测试理论，根据中国就业市场而专业打造。',
        icon: (
          <>
            <path d="M9 3v18" />
            <path d="M15 3v18" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
          </>
        ),
      },
    ],
  },
  en: {
    title: 'Why Squeezer',
    items: [
      {
        cls: 'bg-brand-50 text-brand-500',
        title: 'Smart Squeezing',
        desc: 'Your AI guide learns about you through interview-style chat, so mentor avatars can help you more effectively — and it keeps leveling up.',
        icon: (
          <>
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
          </>
        ),
      },
      {
        cls: 'bg-sage-50 text-sage-500',
        title: 'Real Identities',
        desc: 'Mentor AI avatars carry real interview knowledge bases from frontline HR experts and industry veterans.',
        icon: (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        ),
      },
      {
        cls: 'bg-gold-50 text-gold-600',
        title: 'Science-Based',
        desc: 'Built on the globally recognized Holland (RIASEC) vocational interest framework, tailored for the China job market.',
        icon: (
          <>
            <path d="M9 3v18" />
            <path d="M15 3v18" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
          </>
        ),
      },
    ],
  },
};

export function FeatureCards({ lang }: { lang: 'zh' | 'en' }) {
  const t = copy[lang];
  return (
    <section className="mx-auto max-w-[960px] px-4 pb-12 md:px-5">
      <p className="mb-6 text-center text-base font-medium text-muted">{t.title}</p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {t.items.map((item) => (
          <div
            key={item.title}
            className="rounded-[14px] border border-rule/40 bg-white/80 p-5 transition-all duration-150 hover:shadow-[0_4px_12px_rgba(44,62,92,0.06)]"
          >
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] ${item.cls}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {item.icon}
              </svg>
            </div>
            <h3 className="mb-1.5 text-base font-bold text-ink">{item.title}</h3>
            <p className="text-xs leading-[1.7] text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
