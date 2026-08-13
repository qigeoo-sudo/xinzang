'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/components/language-context';

// 双语导航标签
const navLabels = {
  zh: {
    home: '首页',
    aiGuide: 'AI职导',
    mentors: '行业导师',
    dashboard: '成长追踪',
    history: '对话记录',
    login: '登录',
    register: '注册',
    join: '入会',
    logout: '退出',
    profile: '我的',
    loading: '加载中...',
  },
  en: {
    home: 'Home',
    aiGuide: 'AI Guide',
    mentors: 'Mentors',
    dashboard: 'Growth',
    history: 'History',
    login: 'Log In',
    register: 'Sign Up',
    join: 'Join',
    logout: 'Logout',
    profile: 'Me',
    loading: 'Loading...',
  },
};

/**
 * 顶部导航栏 — 恢复原始 MVP 设计
 * 移动端: 5 个功能图标 (首页/AI职导/行业导师/成长追踪/对话记录)
 * 桌面端: Logo + 导航链接 + 登录/注册/入会按钮
 * 
 * 在 AI 职导对话页面：
 * - 问卷进行中：导航栏随页面滚动（不锁定）
 * - 问卷完成后：导航栏锁定在顶部（sticky），方便用户切换页面
 */
export function Header() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { lang, mounted } = useLanguage();
  const [locked, setLocked] = useState(false);

  const handleLogout = async () => {
    try {
      // 清除所有聊天相关的 localStorage
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('chat-') || key.startsWith('ai-guide-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      await fetch('/api/logout');
      router.push('/');
      router.refresh();
    } catch {
      router.push('/');
    }
  };

  // 监听问卷完成事件 & 检查 localStorage 中的完成状态
  useEffect(() => {
    // 非对话页面不锁定
    if (pathname !== '/chat') {
      setLocked(false);
      return;
    }

    // 未登录时不锁定
    if (status !== 'authenticated' || !session?.user?.id) {
      setLocked(false);
      return;
    }

    // 检查 localStorage 中是否已完成问卷（按用户隔离）
    try {
      const uid = session.user.id;
      const completed = localStorage.getItem(`ai-guide-completed-${uid}`) === 'true';
      const limitTimestamp = localStorage.getItem(`ai-guide-limit-timestamp-${uid}`);
      
      // 如果有限额时间戳且24小时未过，检查完成状态
      if (limitTimestamp) {
        const elapsed = Date.now() - parseInt(limitTimestamp, 10);
        if (elapsed < 24 * 60 * 60 * 1000 && completed) {
          setLocked(true);
        } else {
          setLocked(false);
        }
      } else if (completed) {
        setLocked(true);
      } else {
        setLocked(false);
      }
    } catch {
      setLocked(false);
    }

    // 监听问卷完成事件
    const handleCompleted = () => setLocked(true);
    window.addEventListener('questionnaireCompleted', handleCompleted);
    return () => window.removeEventListener('questionnaireCompleted', handleCompleted);
  }, [pathname, status, session?.user?.id]);

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
      href: '/chat',
      label: tr.aiGuide,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
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
      href: '/history',
      label: tr.history,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
      ),
    },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* 移动端导航 — 5 个功能图标 */}
      <nav className={`glass-nav z-50 md:hidden ${locked ? 'sticky top-0' : ''}`}>
        <div className="flex items-center justify-around px-1 py-1">
          {navItems.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                isActive(item.href) ? 'text-brand-500' : 'text-slate-400'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* 桌面端导航 — Logo + 链接 + 按钮 */}
      <nav className={`glass-nav z-50 hidden md:block ${locked ? 'sticky top-0' : ''}`}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">AI</span>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-semibold text-sm text-brand-900">Career Companion</span>
              <span className="text-[9px] font-medium text-sage-600 mt-0.5">
                Navigate Around Any Singularity, Shape Your Future
              </span>
            </div>
          </Link>

          {/* 导航链接 */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-slate-400 hover:text-brand-500'
                }`}
              >
                {item.icon}
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            ))}
          </div>

          {/* 登录/注册/入会按钮 */}
          <div className="flex items-center gap-2 shrink-0">
            {status === 'loading' ? (
              <span className="text-sm text-slate-400">{tr.loading}</span>
            ) : session?.user ? (
              <>
                <Link
                  href="/dashboard/profile"
                  className="flex items-center gap-1.5 rounded-xl border border-sage-300 bg-sage-50 px-3 py-1.5 text-sm font-medium text-sage-700 shadow-sm transition-all hover:bg-sage-100"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="hidden lg:inline">{session.user.name || tr.profile}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-100"
                >
                  {tr.logout}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 rounded-xl border border-sage-300 bg-sage-50 px-3 py-1.5 text-sm font-medium text-sage-700 shadow-sm transition-all hover:bg-sage-100"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" x2="3" y1="12" y2="12" />
                  </svg>
                  <span className="hidden lg:inline">{tr.login}</span>
                </Link>
                <Link
                  href="/register"
                  className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" x2="19" y1="8" y2="14" />
                    <line x1="22" x2="16" y1="11" y2="11" />
                  </svg>
                  <span className="hidden lg:inline">{tr.register}</span>
                </Link>
                <Link
                  href="/dashboard/subscription"
                  className="flex items-center gap-1.5 rounded-xl border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm font-medium text-sand-700 shadow-sm transition-all hover:bg-sand-100"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                    <path d="M5 21h14" />
                  </svg>
                  <span>{tr.join}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
