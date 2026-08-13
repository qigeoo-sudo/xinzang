'use client';

import { SessionProvider } from 'next-auth/react';
import { LanguageProvider } from '@/components/language-context';

/**
 * Auth.js SessionProvider + LanguageProvider 包装器
 * 必须是 Client Component，在根布局中包裹所有页面
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LanguageProvider>{children}</LanguageProvider>
    </SessionProvider>
  );
}
