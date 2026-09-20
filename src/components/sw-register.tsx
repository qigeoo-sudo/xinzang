'use client';

import { useEffect } from 'react';

/**
 * Service Worker 注册组件
 * 仅生产环境注册（开发环境 HMR 需要实时获取最新资源，缓存会干扰调试）
 * 开发环境下主动注销已有的 SW，避免旧缓存导致白屏
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => {
          console.error('SW registration failed:', err);
        });
    } else {
      // 开发环境：注销所有已注册的 SW，清除旧缓存
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => caches.delete(key));
        });
      }
    }
  }, []);

  return null;
}
