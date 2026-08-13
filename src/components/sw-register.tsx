'use client';

import { useEffect } from 'react';

/**
 * Service Worker 注册组件
 * 仅在生产环境注册，开发环境跳过
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => {
          console.error('SW registration failed:', err);
        });
    }
  }, []);

  return null;
}
