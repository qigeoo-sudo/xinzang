'use client';

import { useEffect } from 'react';

/**
 * Service Worker 注册组件
 * 生产环境和开发环境都注册（localhost 可正常触发 PWA 安装流程）
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator
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
