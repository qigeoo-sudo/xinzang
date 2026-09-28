'use client';

/**
 * 自动行为采集（无 UI）：
 * 1. 路由切换完成 -> page.view（含 referrer）
 * 2. data-track 委托点击 -> cta.click（不读取 data-track-props，杜绝任意 JSON 入库）
 * 3. 页面前台可见且未空闲 -> page.active_duration（离页/隐藏/空闲时上报本段）
 * 规则对应操作手册第 7 章。
 */
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  flushBeacon,
  setPageInstanceId,
  track,
  uuid,
} from '@/lib/analytics/tracker';

const IDLE_AFTER_MS = 30 * 1000;
const TICK_MS = 1000;
const CHECKPOINT_EVERY = 300; // 超长停留每 5 分钟一个增量检查点（容错）

// 模块级守卫：StrictMode 开发环境 effect 双挂载会连发两条 page.view（相隔数毫秒）。
// 同路径 1 秒内的重复 page.view 只留第一条；生产环境无双挂载，不影响真实统计。
let lastPageView: { path: string; ts: number } | null = null;

function mentorIdFromPath(path: string): string | undefined {
  const m = path.match(/^\/mentors\/([^/]+)/);
  return m ? m[1] : undefined;
}

function referrerWithoutQuery(raw: string): string | undefined {
  if (!raw) return undefined;
  const cut = raw.search(/[?#]/);
  return cut === -1 ? raw : raw.slice(0, cut);
}

export function AnalyticsCollector() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);

  // 活跃段状态（ref 保存，监听不重绑）
  const seg = useRef({
    seconds: 0,
    segmentNo: 0,
    checkpointed: 0,
    lastInteraction: Date.now(),
    engaged: true, // 当前是否处于"前台可见且未空闲"
    pagePath: '',
    pageInstanceId: '',
  });

  useEffect(() => {
    const s = seg.current;

    // 上报当前未结算的活跃增量；显式带页面路径（路由切换瞬间 window.location
    // 已指向新路径，不能让 track() 取当前路径）
    const flushPending = () => {
      const delta = s.seconds - s.checkpointed;
      if (delta <= 0) return;
      track('page.active_duration', {
        page: s.pagePath,
        props: {
          activeSeconds: delta,
          segmentNo: s.segmentNo++,
          pageInstanceId: s.pageInstanceId,
          mentorId: mentorIdFromPath(s.pagePath),
        },
      });
    };

    // 结束旧页面的活跃段（路由切换时旧段先上报）
    flushPending();

    // 开始新页面段
    const instanceId = uuid();
    setPageInstanceId(instanceId);
    s.seconds = 0;
    s.checkpointed = 0;
    s.segmentNo = 0; // 段编号每页独立
    s.lastInteraction = Date.now();
    s.engaged = true;
    s.pagePath = pathname;
    s.pageInstanceId = instanceId;

    // page.view（referrer：首次进站取 document.referrer，站内跳转取上一页面）
    // 去重守卫：同路径 1 秒内只记一次（挡 StrictMode 双挂载）
    const nowMs = Date.now();
    if (!lastPageView || lastPageView.path !== pathname || nowMs - lastPageView.ts > 1000) {
      lastPageView = { path: pathname, ts: nowMs };
      const referrer =
        prevPath.current === null
          ? referrerWithoutQuery(document.referrer)
          : prevPath.current;
      track('page.view', { props: referrer ? { referrer } : {} });
    }
    prevPath.current = pathname;

    // ---------- 活跃时长计时 ----------
    const endSegment = (reason: 'hide' | 'idle') => {
      if (!s.engaged) return;
      s.engaged = false;
      flushPending();
      s.checkpointed = s.seconds;
      if (reason === 'idle') s.lastInteraction = 0; // 标记空闲，等待交互唤醒
    };

    const resumeIfIdle = () => {
      const now = Date.now();
      if (!s.engaged && (s.lastInteraction === 0 || document.visibilityState === 'visible')) {
        // 从空闲恢复：旧段已结算，开始新段
        s.engaged = document.visibilityState === 'visible';
        s.seconds = 0;
        s.checkpointed = 0;
        s.lastInteraction = now;
      } else {
        s.lastInteraction = now;
      }
    };

    const timer = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState !== 'visible') return;
      if (!s.engaged) return;
      if (now - s.lastInteraction >= IDLE_AFTER_MS) {
        endSegment('idle');
        return;
      }
      s.seconds++;
      // 增量检查点：上报后继续累计，正常离页只报检查点之后的部分，求和不重复
      if (s.seconds - s.checkpointed >= CHECKPOINT_EVERY) {
        flushPending();
        s.checkpointed = s.seconds;
      }
    }, TICK_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') endSegment('hide');
      else resumeIfIdle();
    };
    const onInteraction = () => resumeIfIdle();
    const onUnload = () => {
      endSegment('hide');
      flushBeacon();
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    for (const ev of ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']) {
      window.addEventListener(ev, onInteraction, { passive: true });
    }

    // ---------- data-track 委托点击 ----------
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-track]');
      if (!el) return;
      const ctaId = el.getAttribute('data-track');
      if (!ctaId) return;
      // label：显式 data-track-label 优先；否则取元素自身文字（去掉多余空白）
      let label = el.getAttribute('data-track-label');
      if (!label) {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text) label = text.slice(0, 30);
      }
      track('cta.click', { props: label ? { ctaId, label } : { ctaId } });
    };
    document.addEventListener('click', onClick);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      for (const ev of ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']) {
        window.removeEventListener(ev, onInteraction);
      }
      document.removeEventListener('click', onClick);
    };
    // 仅在路由切换时重新执行；首次挂载完成初始化
  }, [pathname]);

  return null;
}
