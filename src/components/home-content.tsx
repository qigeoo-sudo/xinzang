'use client';

import { useLanguage } from '@/components/language-context';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { signOut } from 'next-auth/react';

interface HomeContentProps {
  isLoggedIn: boolean;
  isPremium: boolean;
  userInfo: { identifier: string; subscriptionEndDate: string | null } | null;
}

// 双语文案
const t = {
  zh: {
    // Hero 标题
    titleLines: [
      ['每', '个'],
      ['年', '轻', '人'],
      ['的'],
      ['A', 'I'],
      ['职', '业', '伙', '伴'],
    ],
    // CTA
    chatWithAI: '榨职机在等你',
    browseMentors: '浏览行业导师',
    // 三步引导
    stepsTitle: '三步开始你的职业探索之旅',
    step1Title: '和榨职机聊天',
    step1Desc: '通过一次访谈式交流，让我们更了解你',
    step2Title: '选行业导师对话',
    step2Desc: '榨职机帮你引荐，找到匹配的导师分身，榨出干货',
    step3Title: '追踪你的成长',
    step3Desc: '每次对话都在积累，见证自己的成长轨迹',
    // 三卡片
    feature1Title: '智能榨职',
    feature1Desc: 'AI榨职机通过和你进行问卷访谈，以及今后会逐渐开发的更多在线测试，榨出你真正的职业潜力，让AI导师更有效率地帮到你。',
    feature2Title: '真实身份',
    feature2Desc: '行业导师 AI 分身，拥有一线HR大咖及其他行业大咖的真实访谈知识库。理解你的状况，回答你的困惑，陪伴你的成长。',
    feature3Title: '见证成长',
    feature3Desc: '从迷茫到清晰，因为有你，有爱，有光。',
    // 底部卡片
    enterProfile: '进入我的档案',
    register: '注册',
    login: '登录',
    membership: '入会',
    logout: '退出',
    renew: '续费',
    joinMember: '会员',
    tagline: '陪你一起，看清远方',
  },
  en: {
    titleLines: [
      ['E', 'v', 'e', 'r', 'y'],
      ['Y', 'o', 'u', 'n', 'g'],
      ['P', 'e', 'r', 's', 'o', 'n', "'s"],
      ['A', 'I'],
      ['C', 'a', 'r', 'e', 'e', 'r'],
      ['C', 'o', 'm', 'p', 'a', 'n', 'i', 'o', 'n'],
    ],
    chatWithAI: 'Chat with AI Guide',
    browseMentors: 'Browse Mentors',
    stepsTitle: 'Start your career journey in 3 steps',
    step1Title: 'Chat with AI Guide',
    step1Desc: 'Through an interview-style conversation, we get to know you better',
    step2Title: 'Pick an Industry Mentor',
    step2Desc: 'AI Guide refers you to a matched mentor for deeper conversations',
    step3Title: 'Track Your Growth',
    step3Desc: 'Every conversation adds up — witness your growth journey',
    feature1Title: 'Smart Guidance',
    feature1Desc: 'AI Guide collects your basic profile through conversation, helping you find the right AI mentor avatar to serve you more effectively.',
    feature2Title: 'Real Identity',
    feature2Desc: 'Industry mentor AI avatars with real interview knowledge bases from frontline HR experts. Understanding your situation, answering your questions, accompanying your growth.',
    feature3Title: 'Witness Growth',
    feature3Desc: 'From confusion to clarity — because of you, because of love, because of light.',
    enterProfile: 'My Profile',
    register: 'Sign Up',
    login: 'Log In',
    membership: 'Join',
    logout: 'Logout',
    renew: 'Renew',
    joinMember: 'Member',
    tagline: 'Accompany you to see the distance clearly',
  },
};

export function HomeContent({ isLoggedIn, isPremium, userInfo }: HomeContentProps) {
  const { lang, mounted } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const tr = mounted ? t[lang] : t.zh;
  const subHref = `/dashboard/subscription?from=${encodeURIComponent(pathname)}`;

  const handleLogout = async () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('chat-') || key.startsWith('ai-guide-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      await signOut({ redirect: false });
      window.location.href = '/';
    } catch {
      window.location.href = '/';
    }
  };

  return (
    <main className="flex-1">
      {/* 欢迎词 — 登录后显示在左上角 */}
      {isLoggedIn && userInfo?.identifier && (
        <div className="px-4 pt-3">
          <p className="text-sm text-brand-700 font-medium">
            {isPremium && userInfo.subscriptionEndDate
              ? `${lang === 'zh' ? '欢迎登录' : 'Welcome'}, ${userInfo.identifier}，${lang === 'zh' ? '你的会员有效期到' : 'membership expires'} ${userInfo.subscriptionEndDate}`
              : `${lang === 'zh' ? '欢迎登录' : 'Welcome'}, ${userInfo.identifier}`}
          </p>
        </div>
      )}

      <div className="bg-gradient-to-b from-brand-50 via-white to-sand-100 pb-8 md:pb-0">
        {/* 语言切换按钮 */}
        <LanguageToggle />

        {/* Hero 区域 — 原始 MVP 分行动画标题 */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-mesh-gradient" />

          {/* SVG 装饰 — 原始 MVP */}
          <svg
            className="hero-decor absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 375 500"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <g transform="translate(188, 170) scale(1.1) rotate(-15)" opacity="0.4">
              <path d="M -120,0 C -120,-45 -90,-65 -50,-65 C -10,-65 20,-45 20,0 C 20,45 -10,65 -50,65 C -90,65 -120,45 -120,0 Z" fill="none" stroke="#3482a2" strokeWidth="1.5" opacity="0.5" />
              <path d="M -105,0 C -105,-38 -80,-55 -50,-55 C -20,-55 5,-38 5,0 C 5,38 -20,55 -50,55 C -80,55 -105,38 -105,0 Z" fill="none" stroke="#3482a2" strokeWidth="1" opacity="0.35" />
              <path d="M -90,0 C -90,-30 -70,-45 -50,-45 C -30,-45 -10,-30 -10,0 C -10,30 -30,45 -50,45 C -70,45 -90,30 -90,0 Z" fill="none" stroke="#4aadd4" strokeWidth="0.8" opacity="0.25" />
              <path d="M 20,0 C 20,-50 50,-70 90,-70 C 120,-70 135,-50 135,0 C 135,50 120,70 90,70 C 50,70 20,50 20,0 Z" fill="none" stroke="#7ead78" strokeWidth="1.5" opacity="0.5" />
              <path d="M 35,0 C 35,-42 55,-60 90,-60 C 115,-60 125,-42 125,0 C 125,42 115,60 90,60 C 55,60 35,42 35,0 Z" fill="none" stroke="#7ead78" strokeWidth="1" opacity="0.35" />
              <path d="M 50,0 C 50,-34 60,-50 90,-50 C 108,-50 115,-34 115,0 C 115,34 108,50 90,50 C 60,50 50,34 50,0 Z" fill="none" stroke="#cdb293" strokeWidth="0.8" opacity="0.25" />
              <ellipse cx="20" cy="0" rx="6" ry="3" fill="none" stroke="#3482a2" strokeWidth="0.6" opacity="0.3" />
              <g transform="translate(90, 0)" opacity="0.4">
                <path d="M 0,-12 L 2.5,-2.5 L 12,0 L 2.5,2.5 L 0,12 L -2.5,2.5 L -12,0 L -2.5,-2.5 Z" fill="none" stroke="#7ead78" strokeWidth="0.8" />
              </g>
              <g opacity="0.3">
                <circle cx="-50" cy="-20" r="1.2" fill="#cdb293" />
                <circle cx="-50" cy="-35" r="1.2" fill="#cdb293" />
                <circle cx="-50" cy="-50" r="1" fill="#cdb293" opacity="0.7" />
                <circle cx="-50" cy="-65" r="0.8" fill="#cdb293" opacity="0.5" />
              </g>
              <line x1="-80" y1="30" x2="10" y2="-20" stroke="#3482a2" strokeWidth="0.5" opacity="0.2" strokeDasharray="4 3" />
            </g>
            <g transform="translate(55, 80) scale(0.25)" opacity="0.2">
              <ellipse cx="0" cy="0" rx="90" ry="70" fill="none" stroke="#3482a2" strokeWidth="1.5" />
              <ellipse cx="0" cy="0" rx="60" ry="46" fill="none" stroke="#4aadd4" strokeWidth="1" />
              <ellipse cx="0" cy="0" rx="30" ry="22" fill="none" stroke="#7ead78" strokeWidth="0.7" />
            </g>
            <g transform="translate(50, 430)" opacity="0.2">
              <path d="M 0,0 C 50,-10 100,5 150,-5 C 200,-15 250,0 280,-10" fill="none" stroke="#3482a2" strokeWidth="0.8" />
              <path d="M 0,12 C 50,2 100,17 150,7 C 200,-3 250,12 280,2" fill="none" stroke="#7ead78" strokeWidth="0.6" />
            </g>
            <g transform="translate(325, 445) scale(0.5)" opacity="0.22">
              <path d="M 0,-12 L 2.5,-2.5 L 12,0 L 2.5,2.5 L 0,12 L -2.5,2.5 L -12,0 L -2.5,-2.5 Z" fill="none" stroke="#cdb293" strokeWidth="1" />
            </g>
            <line x1="30" y1="475" x2="345" y2="475" stroke="#3482a2" strokeWidth="0.3" opacity="0.1" />
          </svg>

          <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-20">
            <div className="text-center max-w-3xl mx-auto animate-fade-in-up">
              {/* 分行动画标题 */}
              <h1 className="font-serif font-bold text-brand-900 mb-6">
                <span className="flex flex-col items-center justify-center text-[32px] md:text-[40px] leading-tight">
                  {tr.titleLines.map((line, lineIdx) => (
                    <span key={lineIdx} className="flex items-center justify-center">
                      {line.map((char, charIdx) => {
                        const isAIPart = lineIdx >= 3;
                        const delay = `${(lineIdx * 0.5 + charIdx * 0.5)}s, ${(lineIdx * 0.5 + charIdx * 0.5 + 12)}s`;
                        return (
                          <span
                            key={charIdx}
                            className={`inline-block animate-breathe ${isAIPart ? 'bg-gradient-to-r from-brand-500 to-sage-400 bg-clip-text text-transparent' : ''}`}
                            style={{ animationDelay: delay }}
                          >
                            {char}
                          </span>
                        );
                      })}
                    </span>
                  ))}
                </span>
              </h1>

              {/* CTA 按钮 */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/chat" className="btn-primary w-full sm:w-auto">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  </svg>
                  {tr.chatWithAI}
                </Link>
                <Link href="/mentors" className="btn-secondary w-full sm:w-auto">
                  {tr.browseMentors}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 三步引导 */}
        <section className="bg-transparent py-8 md:py-12 border-y border-slate-100/50">
          <div className="mx-auto max-w-6xl px-4">
            <p className="text-sm text-slate-400 text-center mb-6">
              {tr.stepsTitle}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {/* 步骤 1 */}
              <div className="text-center relative">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white font-bold shadow-md shadow-brand-200">
                  1
                </div>
                <h3 className="font-bold text-brand-900 mb-1.5">{tr.step1Title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {tr.step1Desc}
                </p>
                <div className="hidden md:block absolute top-6 left-[60%] w-full">
                  <div className="h-px bg-gradient-to-r from-brand-200 to-sage-200" />
                </div>
              </div>
              {/* 步骤 2 */}
              <div className="text-center relative">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-400 text-white font-bold shadow-md shadow-sage-200">
                  2
                </div>
                <h3 className="font-bold text-brand-900 mb-1.5">{tr.step2Title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {tr.step2Desc}
                </p>
                <div className="hidden md:block absolute top-6 left-[60%] w-full">
                  <div className="h-px bg-gradient-to-r from-sage-200 to-sand-200" />
                </div>
              </div>
              {/* 步骤 3 */}
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sand-500 text-white font-bold shadow-md shadow-sand-200">
                  3
                </div>
                <h3 className="font-bold text-brand-900 mb-1.5">{tr.step3Title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {tr.step3Desc}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 功能特点 — 三卡片 */}
        <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {/* 智能引导 */}
            <div className="card group">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 transition-colors group-hover:bg-brand-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
                  <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <h3 className="font-serif text-lg font-bold text-brand-900 mb-2">{tr.feature1Title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tr.feature1Desc}
              </p>
            </div>
            {/* 真实身份 */}
            <div className="card group">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sage-50 transition-colors group-hover:bg-sage-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage-500">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="font-serif text-lg font-bold text-brand-900 mb-2">{tr.feature2Title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tr.feature2Desc}
              </p>
            </div>
            {/* 见证成长 */}
            <div className="card group">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sand-50 transition-colors group-hover:bg-sand-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sand-600">
                  <path d="M7 20h10" />
                  <path d="M10 20c5.5-2.5.8-6.4 3-10" />
                  <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
                  <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
                </svg>
              </div>
              <h3 className="font-serif text-lg font-bold text-brand-900 mb-2">{tr.feature3Title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tr.feature3Desc}
              </p>
            </div>
          </div>
        </section>

        {/* 最后一张卡片 — 根据登录/会员状态显示不同按钮 */}
        <section className="mx-auto max-w-6xl px-4 py-8 md:py-10">
          <div className="card-warm flex flex-col items-center gap-5">
            {/* 按钮 */}
            <div className="flex items-center gap-1.5 justify-center w-full">
              {isLoggedIn && isPremium ? (
                <>
                  {/* 已登录 + 会员：退出 + 续费 */}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1 rounded-xl bg-sand-400 px-2.5 py-1.5 text-[11px] font-normal text-sand-900 shadow-sm transition-all hover:bg-sand-300 active:scale-95 whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
                    {tr.logout}
                  </button>
                  <Link
                    href={subHref}
                    className="flex items-center gap-1 rounded-xl border border-sand-400/50 bg-sand-500/15 px-2.5 py-1.5 text-[11px] font-medium text-sand-200 shadow-sm transition-all hover:bg-sand-500/25 whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                    {tr.renew}
                  </Link>
                </>
              ) : isLoggedIn && !isPremium ? (
                <>
                  {/* 已登录 + 非会员：退出 + 会员 */}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1 rounded-xl bg-sand-400 px-2.5 py-1.5 text-[11px] font-normal text-sand-900 shadow-sm transition-all hover:bg-sand-300 active:scale-95 whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
                    {tr.logout}
                  </button>
                  <Link
                    href={subHref}
                    className="flex items-center gap-1 rounded-xl border border-sand-400/50 bg-sand-500/15 px-2.5 py-1.5 text-[11px] font-medium text-sand-200 shadow-sm transition-all hover:bg-sand-500/25 whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                      <path d="M5 21h14" />
                    </svg>
                    {tr.joinMember}
                  </Link>
                </>
              ) : (
                <>
                  {/* 未登录：注册 + 登录 + 入会 */}
                  <Link
                    href="/register"
                    className="flex items-center gap-1 rounded-xl bg-sand-400 px-2.5 py-1.5 text-[11px] font-normal text-sand-900 shadow-sm transition-all hover:bg-sand-300 active:scale-95 whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" x2="19" y1="8" y2="14" />
                      <line x1="22" x2="16" y1="11" y2="11" />
                    </svg>
                    {tr.register}
                  </Link>
                  <Link
                    href="/login"
                    className="flex items-center gap-1 rounded-xl border border-sage-400/50 bg-sage-500/20 px-2.5 py-1.5 text-[11px] font-medium text-sage-200 shadow-sm transition-all hover:bg-sage-500/30 whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" x2="3" y1="12" y2="12" />
                    </svg>
                    {tr.login}
                  </Link>
                  <Link
                    href="/dashboard/subscription"
                    className="flex items-center gap-1 rounded-xl border border-sand-400/50 bg-sand-500/15 px-2.5 py-1.5 text-[11px] font-medium text-sand-200 shadow-sm transition-all hover:bg-sand-500/25 whitespace-nowrap"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                      <path d="M5 21h14" />
                    </svg>
                    {tr.membership}
                  </Link>
                </>
              )}
            </div>

            {/* Logo 文字 */}
            <div className="text-center">
              <p className="text-xs text-sand-200/80 leading-relaxed">
                AI Career Companion
              </p>
              <p className="text-[10px] text-sand-300/60 mt-1">
                {tr.tagline}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
