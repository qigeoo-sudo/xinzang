'use client';

/** 付费页访问上报（无 UI）；from 为入口标记，sourceMentorId 为入口分身（可空） */
import { useEffect } from 'react';
import { track } from '@/lib/analytics/tracker';

// StrictMode 双挂载守卫（dev）：同一页面实例只报一次
let lastReportedPath: string | null = null;

export function PaywallTracker({
  from,
  sourceMentorId,
}: {
  from?: string;
  sourceMentorId?: string;
}) {
  useEffect(() => {
    if (typeof window !== 'undefined' && lastReportedPath === window.location.pathname) return;
    if (typeof window !== 'undefined') lastReportedPath = window.location.pathname;
    track('paywall.view', {
      props: {
        ...(from ? { from } : {}),
        ...(sourceMentorId ? { sourceMentorId } : {}),
      },
    });
  }, [from, sourceMentorId]);

  return null;
}
