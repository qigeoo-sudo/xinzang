"use client";

import { useI18n } from "@/lib/i18n";
import { Navbar } from "./navbar";

/**
 * Client-side layout wrapper.
 * Uses `key={lang}` to force all page content to remount
 * when the language changes, ensuring every component picks up
 * the new language from context on re-render.
 */
export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main key={lang} className="flex-1">
        {children}
      </main>
    </div>
  );
}
