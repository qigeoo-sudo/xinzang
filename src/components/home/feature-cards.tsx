const copy = {
  zh: {
    letterhead: '榨职机 · AI CAREER COMPANION',
    greeting: '亲爱的你：',
    paragraphs: [
      '从小到大，你一路闯关。小升初，中考，高考，考研。每一次，都有人在前面告诉你该做什么，有人在后面督促你有没有做到。',
      '现在，你站在职场的门口了。',
      '你突然发现，那个随时可以问问题的老师，不见了。那个随时陪着你、盯着你的人，也不见了。',
      '你面对的，都是“同事”。成熟的，但有点冷漠的。',
      '你是不是在递简历之前，想过找父母或者朋友，帮你认识一下那个即将看你简历的HR？',
      '你是不是刚进职场，在茶水间遇到一位大咖，想拉住他把所有问题问个究竟——这个行业到底怎么样？我该不该接这个offer？我是不是选错了方向？为什么我干得最多，却好像没人看见？',
      '你是不是想通过社团，认识几位刚拿到大公司offer的学长学姐，问问他们到底是怎么走过来的？',
      '你激动，兴奋，也有点胆怯。你打算把自己扔进职场了。',
      '你多希望这个时候，能把那些职场大咖、面试HR、学长学姐的经验，一股脑扔进一个榨汁机里，榨出你最想要的那一口。',
      '现在，榨职机让这一切触手可及。',
      '我们的创始团队，是数十年职场招聘经验的HR和高管。他们决定在退休之前，把自己和周围的人狠狠榨取一把。每个人都通过一套360度访谈问答，把自己的经验浓缩成一个AI分身。这个分身会随着你的使用，因为更了解你，而日益强大。',
    ],
    optionsIntro: '无论你现在是——',
    options: [
      '完全摸不到方向，',
      '有自己强烈感兴趣的公司和行业，但抓不到门路，',
      '还是刚入职场，惴惴然想找个伴儿随时答疑，',
    ],
    optionsOutro: '都可以直接在榨职机旁边，随时榨一杯。',
    closingLead: '榨出安全感，榨出你的职场好机会。',
    motto: '好职业，榨出来。',
    psLabel: '又及',
    psBody:
      '下面是广告时间。我们来阐述一下，为什么求职、跳槽、晋升等等人生大事，都需要我们的榨职机。',
    cards: [
      {
        title: '真实身份',
        desc: '行业导师 AI 分身，拥有一线HR大咖及其他行业精英的真实访谈知识库。理解你的状况，回答你的困惑，陪伴你的成长。',
      },
      {
        title: '科学定制',
        desc: '采用国际标准的霍兰德职业兴趣测试理论，根据中国就业市场专业打造，发现你的职业兴趣，规划你的职业起步。',
      },
      {
        title: '长期伴随',
        desc: '建立个人档案，留存历史聊天记录，一起绕过职场上的各种坑，前往你想去的远方。',
      },
    ],
    signName: '榨职机',
    signRest: '· AI Career Companion 团队',
  },
  en: {
    letterhead: 'SQUEEZER · AI CAREER COMPANION',
    greeting: 'Dear Student,',
    opener:
      'It is our great pleasure to congratulate you at this wonderful moment — you have entered the world of Squeezer!',
    paragraphs: [
      '“Squeezer” originated at the WAIC UP Young Observers Forum and from an ongoing collection of global innovation cases in the age of AI. We noticed that technology is rapidly changing the way people find jobs, yet what many young people truly lack is not another set of standard answers — but a person of experience, willing to understand their situation, tell them what industries are really like, and walk with them as they learn to make choices.',
      'This is precisely what “Squeezer” is made for.',
      'We serve young people who are job hunting or exploring their career direction. We first build trust through connections with real mentors, then use AI to turn mentors’ experience, judgment frameworks, and life insights into “mentor avatars” that can accompany young people on an ongoing basis.',
      'We do not want cold AI to replace communication between people. Quite the opposite — we hope to first build genuine relationships, and then use AI to amplify real-life wisdom, so that insights which once could reach only a few may light the way for many more young people who truly need them.',
    ],
    closingLead: 'Together, we shall witness the incredible future.',
    motto: 'Great careers, squeezed out.',
    psLabel: 'P.S.',
    psBody:
      'And now for a word from our sponsor: let us explain why life’s big moments — job hunting, job hopping, promotion — all call for Squeezer.',
    cards: [
      {
        title: 'Real Identities',
        desc: 'Mentor AI avatars carry real interview knowledge bases from frontline HR experts and industry veterans. They understand your situation, answer your questions, and grow with you.',
      },
      {
        title: 'Science-Based',
        desc: 'Built on the globally recognized Holland (RIASEC) vocational interest framework, tailored for the China job market.',
      },
      {
        title: 'Privacy First',
        desc: 'While building your profile and keeping chat records, you can wipe all career-related data at any time — your privacy is fully guarded.',
      },
    ],
    signName: 'Squeezer',
    signRest: '· AI Career Companion Team',
  },
};

/**
 * Offer letter：一张从金属卡下方铺出的正式信函。
 * 暖白纸面（.letter-paper 噪点纹理 + 衬纸 + 厚投影）浮在机身灰蓝丝绒上；
 * 机构抬头双金线 → 称呼 → 正文 → motto → 又及（广告时间）→ 三张卖点卡 → 签名。
 * 右上角 eye 图标可折叠/展开信纸；折叠时仅留切换条，黑卡上移至原信纸上边缘。
 */
export function FeatureCards({
  lang,
  visible = true,
  onToggle,
}: {
  lang: 'zh' | 'en';
  visible?: boolean;
  onToggle?: () => void;
}) {
  const t = copy[lang];
  return (
    <section className="relative mx-auto max-w-[840px] px-5 pt-10">
      {/* 显示/隐藏切换按钮：固定在信纸右上角 */}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-5 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-ink/60 shadow-sm transition-colors hover:bg-white hover:text-ink"
          aria-label={visible ? '隐藏信纸' : '显示信纸'}
          title={visible ? '隐藏信纸' : '显示信纸'}
        >
          {visible ? (
            // eye-open
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            // eye-off
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          )}
        </button>
      )}

      {visible && (
      <article className="letter-paper rounded-[16px] px-7 py-12 md:px-14 md:py-16">
        {/* 机构抬头：双金线 + 名称 */}
        <header className="text-center">
          <div className="mx-auto mb-2.5 h-[2px] w-40 bg-[#B0852E]/70" aria-hidden />
          <div className="mx-auto h-px w-40 bg-[#B0852E]/40" aria-hidden />
          <p className="mt-4 font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-ink/60">
            {t.letterhead}
          </p>
        </header>

        {/* 称呼 */}
        <p className="mt-10 font-serif text-[17px] font-bold text-ink">{t.greeting}</p>

        {/* 正文：中文信每段首行缩进 2em；英文段不缩进，用段距区分 */}
        <div className="mt-5 space-y-5 font-serif text-[15px] leading-[2.05] text-ink/85">
          {'opener' in t && t.opener && (
            <p className={lang === 'zh' ? 'indent-[2em]' : ''}>{t.opener}</p>
          )}
          {t.paragraphs.map((p) => (
            <p key={p.slice(0, 16)} className={lang === 'zh' ? 'indent-[2em]' : ''}>
              {p}
            </p>
          ))}
          {'options' in t && (
            <div className="space-y-1">
              <p className={lang === 'zh' ? 'indent-[2em]' : ''}>{t.optionsIntro}</p>
              {t.options.map((o) => (
                <p key={o.slice(0, 8)} className={lang === 'zh' ? 'indent-[2em]' : ''}>
                  {o}
                </p>
              ))}
              <p className={lang === 'zh' ? 'indent-[2em]' : ''}>{t.optionsOutro}</p>
            </div>
          )}
          <p className={lang === 'zh' ? 'indent-[2em]' : ''}>{t.closingLead}</p>
        </div>

        {/* motto：低调收尾，普通正文排版，首行缩进两格 */}
        <p className={`mt-4 font-serif text-[15px] leading-[2.05] text-ink/85 ${lang === 'zh' ? 'indent-[2em]' : ''}`}>{t.motto}</p>

        {/* 又及：广告时间 */}
        <div className="mt-12 border-t border-dashed border-ink/20 pt-7">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-[#A87B25]">
            {t.psLabel}
          </p>
          <p className={`mt-3 font-serif text-[15px] leading-[2.05] text-ink/85 ${lang === 'zh' ? 'indent-[2em]' : ''}`}>{t.psBody}</p>
        </div>

        {/* 三张卖点卡：纸面白卡，编号用金墨色 */}
        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {t.cards.map((card, i) => (
            <div
              key={card.title}
              className="rounded-[14px] border border-ink/10 bg-white/85 p-5 shadow-[0_6px_18px_-10px_rgba(44,62,92,0.25)]"
            >
              <span className="font-serif text-[20px] font-bold leading-none text-[#B0852E]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 font-serif text-[15px] font-bold text-ink">{card.title}</h3>
              <p className="mt-2 text-[12.5px] leading-[1.85] text-muted">{card.desc}</p>
            </div>
          ))}
        </div>

        {/* 签名：榨职机三个字做草写花押，落款小字随其后 */}
        <footer className="mt-12 text-right">
          <div
            aria-hidden
            className="ml-auto mb-3 h-px w-44 bg-gradient-to-r from-transparent to-[#B0852E]/50"
          />
          <p className="flex items-baseline justify-end gap-2.5">
            <span className="signature-hand text-[34px] font-bold leading-none text-ink md:text-[40px]">
              {t.signName}
            </span>
            <span className="font-serif text-[13px] font-bold text-ink/80">{t.signRest}</span>
          </p>
        </footer>
      </article>
      )}
    </section>
  );
}
