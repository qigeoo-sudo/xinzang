const copy = {
  zh: {
    kicker: 'WHY',
    title: '为什么选择榨职机',
    items: [
      {
        title: '真实身份',
        desc: '行业导师 AI 分身，拥有一线HR大咖及其他行业精英的真实访谈知识库。理解你的状况，回答你的困惑，陪伴你的成长。',
      },
      {
        title: '科学定制',
        desc: '采用国际标准的霍兰德职业兴趣测试理论，根据中国就业市场专业打造，发现你的职业兴趣，规划你的职业起步。',
      },
      {
        title: '隐私保护',
        desc: '建立个人档案、留存聊天记录的同时，也允许用户随时清空一切职业类数据，彻底守护你的隐私。',
      },
    ],
  },
  en: {
    kicker: 'WHY',
    title: 'Why Squeezer',
    items: [
      {
        title: 'Smart Squeezing',
        desc: 'Your AI guide learns about you through interview-style chat, so mentor avatars can help you more effectively — and it keeps leveling up.',
      },
      {
        title: 'Real Identities',
        desc: 'Mentor AI avatars carry real interview knowledge bases from frontline HR experts and industry veterans.',
      },
      {
        title: 'Science-Based',
        desc: 'Built on the globally recognized Holland (RIASEC) vocational interest framework, tailored for the China job market.',
      },
    ],
  },
};

export function FeatureCards({ lang }: { lang: 'zh' | 'en' }) {
  const t = copy[lang];
  return (
    <section>
      <div className="mx-auto max-w-[840px] px-5 py-14 md:py-16">
        <div className="mb-8 flex items-center gap-3">
          <span className="masthead-label">{t.kicker}</span>
          <span className="h-px flex-1 bg-ink/15" aria-hidden />
        </div>
        <h2 className="mb-10 max-w-[420px] font-serif text-[24px] font-bold leading-snug text-ink md:mb-12 md:text-[30px]">
          {t.title}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {t.items.map((item, i) => (
            <div
              key={item.title}
              className="clay-soft rounded-[20px] bg-bg-cream p-6"
            >
              <span className="font-serif text-[28px] font-bold leading-none text-brand-500">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 font-serif text-lg font-bold text-ink">{item.title}</h3>
              <p className="mt-2.5 text-[13px] leading-[1.85] text-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
