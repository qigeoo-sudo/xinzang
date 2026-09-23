'use client';

import { useEffect } from 'react';

/**
 * Service Worker 注册组件
 * 生产环境注册 SW 以支持 PWA 安装和离线缓存。
 * 开发环境默认注销 SW 以保证 HMR 正常；如需本地测试 PWA 安装，
 * 设置环境变量 NEXT_PUBLIC_ENABLE_SW_DEV=1 可在开发环境注册 SW。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const enableSwInDev = process.env.NEXT_PUBLIC_ENABLE_SW_DEV === '1';

    if (process.env.NODE_ENV === 'production' || enableSwInDev) {
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
