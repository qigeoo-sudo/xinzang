const copy = {
  zh: {
    letterhead: '榨职机 · AI CAREER COMPANION',
    greeting: '亲爱的同学：',
    opener:
      '在这美好的时刻，我们非常高兴地恭喜你——来到了榨职机的世界！',
    paragraphs: [
      '“榨职机”缘起于 WAIC UP 青年观察家论坛及 AI 时代全球创新案例的持续征集。我们关注到：技术正在快速改变求职方式，但许多年轻人真正缺少的，并不是更多标准答案，而是一位有阅历的人，愿意理解他的处境，告诉他行业真实的样子，并陪他学会做选择。',
      '这正是“榨职机”想做的事。',
      '我们面向正在求职和探索职业方向的年轻人，通过真实的导师连接建立信任，再用 AI 将导师的经验、判断框架与人生体会转化为可以持续陪伴年轻人的“导师分身”。',
      '我们不希望用冷冰冰的 AI 取代人与人的交流。恰恰相反，我们希望先建立真实的关系，再用 AI 放大真实的人生经验——让原本只能影响少数人的智慧，能够照亮更多真正需要它的年轻人。',
    ],
    closingLead: '于是我们将共同见证，未来的不可思议。',
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
        title: '隐私保护',
        desc: '建立个人档案、留存聊天记录的同时，也允许用户随时清空一切职业类数据，彻底守护你的隐私。',
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
 */
export function FeatureCards({ lang }: { lang: 'zh' | 'en' }) {
  const t = copy[lang];
  return (
    <section className="mx-auto max-w-[840px] px-5 pt-10">
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
          <p className={lang === 'zh' ? 'indent-[2em]' : ''}>{t.opener}</p>
          {t.paragraphs.map((p) => (
            <p key={p.slice(0, 16)} className={lang === 'zh' ? 'indent-[2em]' : ''}>
              {p}
            </p>
          ))}
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
    </section>
  );
}
