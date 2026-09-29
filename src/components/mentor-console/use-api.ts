'use client';

/** 简单数据获取 hook：统一 loading/error/重新取数出口
 *  演示模式：从 /demo/*.json 加载静态数据，不走 API 查库 */
import { useCallback, useEffect, useState } from 'react';

const DEMO_URL_MAP: Record<string, string> = {
  '/api/mentor/summary?range=90': '/demo/summary.json',
  '/api/mentor/trend?range=60': '/demo/trend.json',
  '/api/mentor/trend?range=90': '/demo/trend.json',
  '/api/mentor/audience': '/demo/audience.json',
  '/api/mentor/submissions': '/demo/submissions.json',
  '/api/mentor/profile': '/demo/profile.json',
};

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError('');
    try {
      const fetchUrl = DEMO_URL_MAP[url] ?? url;
      const res = await fetch(fetchUrl, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? '加载失败');
      setData(body as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

/** 判断某个 GET URL 是否走 demo 静态 JSON（用于提交逻辑分支：demo 模式本地 mock，不走真实 POST） */
export function isDemoMode(url: string): boolean {
  return url in DEMO_URL_MAP;
}
