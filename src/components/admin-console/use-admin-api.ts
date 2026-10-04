'use client';

/** 管理员后台数据获取 hook
 *  演示阶段：从 /demo/admin/*.json 加载静态数据；
 *  真实后端就绪后，把 DEMO_URL_MAP 里的映射去掉即自动走 API。
 *  数据区间：自动把全局 start/end 拼到 query（demo 静态文件会忽略 query，真实后端按区间过滤）。 */
import { useCallback, useEffect, useState } from 'react';
import { useDataRange } from './date-range-context';

const DEMO_URL_MAP: Record<string, string> = {
  '/api/admin/overview': '/demo/admin/overview.json',
  '/api/admin/pages': '/demo/admin/pages.json',
  '/api/admin/ctas': '/demo/admin/ctas.json',
  '/api/admin/journeys': '/demo/admin/journeys.json',
  '/api/admin/journey-graph': '/demo/admin/journey-graph.json',
  '/api/admin/retention': '/demo/admin/retention.json',
  '/api/admin/mentors': '/demo/admin/mentors.json',
  '/api/admin/users': '/demo/admin/users.json',
  '/api/admin/channels-summary': '/demo/admin/channels-summary.json',
};

export function useAdminApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState('');
  const range = useDataRange();

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError('');
    try {
      const base = DEMO_URL_MAP[url] ?? url;
      const qs = new URLSearchParams({ start: range.start, end: range.end }).toString();
      const fetchUrl = `${base}?${qs}`;
      const res = await fetch(fetchUrl, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? '加载失败');
      setData(body as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [url, range.start, range.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
