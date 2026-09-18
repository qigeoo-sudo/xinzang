'use client';

/**
 * 渠道归因 — 落地抓取（无 UI，挂在全站 layout）
 *
 * 处理直接带参访问的链接：?ch=xxx（或 ?channel=）& utm_source/medium/campaign/term/content。
 * /r/{code} 短链已在服务端写 httpOnly cookie，不需要这里处理。
 *
 * 首次触点锁定：已有 ch_attr cookie 或 localStorage 快照时绝不覆盖。
 * 快照同时写 cookie（随注册请求自动带上）和 localStorage（微信内浏览器换默认浏览器时的兜底）。
 */
import { useEffect } from 'react';

const ATTR_COOKIE = 'ch_attr';
const ATTR_LS_KEY = 'ch_attr';
const ATTR_MAX_AGE = 30 * 24 * 60 * 60;

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const hit = document.cookie
    .split('; ')
    .find((item) => item.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : null;
}

export function AttributionCapture() {
  useEffect(() => {
    try {
      // 已有首次触点（httpOnly cookie 读不到，但 localStorage 或普通 cookie 存在即说明锁定过）
      if (readCookie(ATTR_COOKIE) || localStorage.getItem(ATTR_LS_KEY)) return;

      const sp = new URLSearchParams(window.location.search);
      const ch = sp.get('ch') || sp.get('channel');
      if (!ch) return;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ch)) return;

      const snap = {
        ch,
        source: sp.get('utm_source') || undefined,
        medium: sp.get('utm_medium') || undefined,
        campaign: sp.get('utm_campaign') || undefined,
        term: sp.get('utm_term') || undefined,
        content: sp.get('utm_content') || undefined,
        landing: window.location.pathname,
        ts: new Date().toISOString(),
      };
      const raw = JSON.stringify(snap);
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${ATTR_COOKIE}=${encodeURIComponent(raw)}; path=/; max-age=${ATTR_MAX_AGE}; SameSite=Lax${secure}`;
      localStorage.setItem(ATTR_LS_KEY, raw);
    } catch {
      // 隐私模式/存储被禁：静默放弃，不影响浏览与注册（注册时按自然量处理）
    }
  }, []);

  return null;
}
