'use client';

import { useLanguage } from '@/components/language-context';

/**
 * 中英文切换按钮
 * 使用全局 LanguageContext，可切换全站所有页面语言
 * 语言选择持久化到 localStorage
 */
export function LanguageToggle() {
  const { lang, toggleLang, mounted } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="fixed top-20 right-3 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-white/90 text-xs font-bold text-accent shadow-md backdrop-blur-md transition-all hover:bg-accent/10 active:scale-90 md:top-20 md:right-6 md:h-10 md:w-10 md:text-sm"
      title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      {mounted ? (lang === 'zh' ? 'EN' : 'CH') : 'EN'}
    </button>
  );
}
