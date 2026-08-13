'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Lang = 'zh' | 'en';

interface LanguageContextValue {
  lang: Lang;
  toggleLang: () => void;
  setLang: (lang: Lang) => void;
  mounted: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'zh',
  toggleLang: () => {},
  setLang: () => {},
  mounted: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('app-lang') as Lang | null;
    if (saved) setLangState(saved);
    setMounted(true);
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('app-lang', newLang);
    window.dispatchEvent(new CustomEvent('lang-change', { detail: newLang }));
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'zh' ? 'en' : 'zh');
  }, [lang, setLang]);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, setLang, mounted }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
