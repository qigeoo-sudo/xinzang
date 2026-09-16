'use client';

import { useLanguage } from '@/components/language-context';

/**
 * 中英文切换按钮（页头右上角的白色圆形气泡）
 * 使用全局 LanguageContext，可切换全站所有页面语言
 * 语言选择持久化到 localStorage
 */
export function LanguageToggle() {
  const { lang, toggleLang, mounted } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/85 font-mono text-[10px] font-medium text-ink shadow-[0_4px_14px_rgba(44,62,92,0.18)] backdrop-blur-sm transition-all hover:bg-white active:scale-95"
      title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      {mounted ? (lang === 'zh' ? 'EN' : 'CH') : 'EN'}
    </button>
  );
}
