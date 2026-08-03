"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translations, type Lang } from "./translations";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: typeof translations;
  tr: (obj: { zh: string; en: string }) => string;
  trFmt: (obj: { zh: string; en: string }, vars: Record<string, string | number>) => string;
  hydrated: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "app_language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "zh") {
        setLangState(saved);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // ignore
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const newLang: Lang = prev === "zh" ? "en" : "zh";
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
      } catch {
        // ignore
      }
      return newLang;
    });
  }, []);

  const tr = useCallback(
    (obj: { zh: string; en: string }) => obj[lang],
    [lang]
  );

  const trFmt = useCallback(
    (obj: { zh: string; en: string }, vars: Record<string, string | number>) => {
      let result = obj[lang];
      for (const [key, val] of Object.entries(vars)) {
        result = result.replace(`{${key}}`, String(val));
      }
      return result;
    },
    [lang]
  );

  return (
    <I18nContext.Provider
      value={{ lang, setLang, toggleLang, t: translations, tr, trFmt, hydrated }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return ctx;
}
