'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useLanguage } from '@/components/language-context';

// 双语导航标签
const navLabels = {
  zh: {
    home: '首页',
    assessment: '职业测试',
    mentors: '行业导师',
    dashboard: '成长追踪',
    myProfile: '我的档案',
    login: '登录',
    register: '注册',
    subscribe: '订阅',
    renew: '升级',
    logout: '退出',
    loading: '加载中...',
  },
  en: {
    home: 'Home',
    assessment: 'Assessment',
    mentors: 'Mentors',
    dashboard: 'Growth',
    myProfile: 'My Profile',
    login: 'log in',
    register: 'sign up',
    subscribe: 'Subscribe',
    renew: 'Upgrade',
    logout: 'Logout',
    loading: 'Loading...',
  },
};

/**
 * 顶部导航栏
 * 移动端: 第一行 Logo + Career Companion + 功能按钮；第二行 5 个功能入口
 * 桌面端: Logo + 导航链接 + 功能按钮（单行）
 * 功能按钮三态: 未登录=注册/登录；非会员=订阅/退出；会员=升级/退出
 */
function HeaderInner() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, mounted } = useLanguage();
  const subHref = `/dashboard/subscription?from=${encodeURIComponent(pathname)}`;

  const handleLogout = async () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chat-')) {
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

  const tr = mounted ? navLabels[lang] : navLabels.zh;

  const navItems = [
    {
      href: '/',
      label: tr.home,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
    },
    {
      href: '/assessment',
      label: tr.assessment,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      href: '/mentors',
      label: tr.mentors,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      href: '/dashboard',
      label: tr.dashboard,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      ),
    },
    {
      href: '/dashboard/profile',
      label: tr.myProfile,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  // 取与路径前缀匹配「最长」的导航项，避免 /dashboard/profile 同时高亮「成长追踪」
  const matchNavHref = (p: string): string | null => {
    const matched = navItems
      .filter((item) => item.href !== '/' && (p === item.href || p.startsWith(item.href + '/')))
      .sort((a, b) => b.href.length - a.href.length);
    return matched[0]?.href ?? null;
  };

  // useSearchParams 是响应式的 — 当 URL 参数变化时自动重新渲染
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';

    // 在登录/注册页面时，根据 callbackUrl 高亮对应图标
    if (pathname === '/login' || pathname === '/register-v2') {
      const cbUrl = searchParams.get('callbackUrl') || '/';
      if (href === '/') return cbUrl === '/';
      return matchNavHref(cbUrl) === href;
    }

    return matchNavHref(pathname) === href;
  };

  // 导航栏固定在顶部（占文档流，不遮挡内容）
  const lockedClass = 'sticky top-0 z-50';

  // 功能按钮（三态）：未登录=注册/登录；非会员=订阅/退出；会员=升级/退出
  // compact=true 用于手机端第一行
  const renderActions = (compact: boolean) => {
    const box = compact ? 'px-2.5 py-1 text-xs gap-1 rounded-[10px]' : 'px-3 py-1.5 text-sm gap-1.5 rounded-[10px]';
    const iconPx = compact ? 14 : 16;

    const crownIcon = (
      <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
        <path d="M5 21h14" />
      </svg>
    );

    const logoutButton = (
      <button
        onClick={handleLogout}
        className={`flex items-center border border-ink/20 bg-bg-cream font-medium text-ink/70 transition-all hover:border-ink/45 hover:text-ink ${box}`}
      >
        <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
        {tr.logout}
      </button>
    );

    if (status === 'loading') {
      return <span className={`text-slate-400 ${box}`}>{tr.loading}</span>;
    }

    if (session?.user) {
      const isPremiumUser = !!session.user.isPremium;
      return (
        <>
          <Link
            href={subHref}
            className={
              isPremiumUser
                ? `flex items-center border border-sage-600/30 bg-sage-50 font-medium text-sage-700 transition-all hover:bg-sage-100 ${box}`
                : `clay flex items-center justify-center font-semibold text-ink transition-all active:scale-95 ${compact ? 'bg-[#FFF9F2] hover:bg-white' : 'bg-brand-500 hover:bg-brand-400'} ${box}`
            }
          >
            {crownIcon}
            {isPremiumUser ? tr.renew : tr.subscribe}
          </Link>
          {logoutButton}
        </>
      );
    }

    return (
      <>
        <Link
          href="/register-v2"
          className={`flex items-center justify-center border border-sage-400 bg-sage-400 font-semibold text-white transition-all hover:border-sage-500 hover:bg-sage-500 ${compact ? 'min-w-[78px]' : 'min-w-[92px]'} ${box}`}
        >
          <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" x2="19" y1="8" y2="14" />
            <line x1="22" x2="16" y1="11" y2="11" />
          </svg>
          {tr.register}
        </Link>
        <Link
          href="/login"
          className={`flex items-center justify-center border border-ink/20 bg-bg-cream font-medium text-ink/70 transition-all hover:border-ink/45 hover:text-ink ${compact ? 'min-w-[78px]' : 'min-w-[92px]'} ${box}`}
        >
          <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" x2="3" y1="12" y2="12" />
          </svg>
          {tr.login}
        </Link>
      </>
    );
  };

  return (
    <>
      {/* 移动端导航 — 第一行（窄行）Logo+名称+功能按钮，第二行（宽行）5 个功能入口 */}
      <nav className={`glass-nav z-50 md:hidden ${lockedClass}`}>
        <div className="nav-extend flex h-12 items-center justify-between gap-2 px-3">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/icons/icon-1024.png"
              alt="榨职机 Career Companion"
              width={32}
              height={32}
              priority
              className="h-8 w-8"
            />
            <span className="truncate font-serif text-[13px] font-bold text-ink">
              Career Companion
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            {renderActions(true)}
          </div>
        </div>
        {/* 宽行：奶油玻璃底，遮挡渐变延续段 */}
        <div className="flex items-center justify-around border-t border-ink/10 px-1">
          {navItems.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                isActive(item.href) ? 'text-accent' : 'text-ink/55 hover:text-accent'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* 桌面端导航 — Logo + 链接 + 功能按钮 */}
      <nav className={`glass-nav z-50 hidden md:block ${lockedClass}`}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image
              src="/icons/icon-1024.png"
              alt="榨职机 Career Companion"
              width={40}
              height={40}
              priority
              className="h-10 w-10"
            />
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-serif text-sm font-bold text-ink">Career Companion</span>
              <span className="mt-1 font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-ink/45">
                Navigate Around Any Singularity, Shape Your Future
              </span>
            </div>
          </Link>

          {/* 导航链接：平时灰，悬停/选中变鼠尾草绿 */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href) ? 'text-accent' : 'text-ink/55 hover:text-accent'
                }`}
              >
                {item.icon}
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            ))}
          </div>

          {/* 功能按钮：注册/登录 | 订阅/退出 | 升级/退出 */}
          <div className="flex items-center gap-2 shrink-0">
            {renderActions(false)}
          </div>
        </div>
      </nav>
    </>
  );
}

/**
 * Header 导出组件 — 内部用 Suspense 包装以支持 useSearchParams
 */
export function Header() {
  return (
    <Suspense
      fallback={
        <nav className="glass-nav z-50 h-[89px] md:h-14" />
      }
    >
      <HeaderInner />
    </Suspense>
  );
}
