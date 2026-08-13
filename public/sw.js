/**
 * Service Worker — PWA 离线缓存
 *
 * 策略:
 * - 静态资源 (JS/CSS/图片): Cache First (缓存优先)
 * - 页面导航: Network First, fallback to cache (网络优先, 离线时用缓存)
 * - API 请求: 不缓存 (实时性要求)
 */

const CACHE_NAME = 'ai-career-v1';
const STATIC_CACHE = 'ai-career-static-v1';
const PAGE_CACHE = 'ai-career-pages-v1';

// 预缓存的静态资源
const PRECACHE_URLS = [
  '/',
  '/mentors',
  '/manifest.json',
];

// 静态资源后缀
const STATIC_ASSETS = /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|gif|webp|svg|ico)$/;

// Install — 预缓存
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate — 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, PAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — 缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  // API 请求不缓存
  if (url.pathname.startsWith('/api/')) return;

  // GET 请求
  if (request.method !== 'GET') return;

  // 静态资源 — Cache First
  if (STATIC_ASSETS.test(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fetched = await fetch(request);
        if (fetched.ok) cache.put(request, fetched.clone());
        return fetched;
      })
    );
    return;
  }

  // 页面导航 — Network First, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // 离线 — 尝试从缓存读取
          const cached = await cache.match(request);
          if (cached) return cached;
          // 最终 fallback 到首页缓存
          const fallback = await cache.match('/');
          if (fallback) return fallback;
          return new Response('离线模式，请检查网络连接', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })
    );
  }
});
