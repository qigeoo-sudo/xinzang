/**
 * 客户端行为埋点 SDK — 事件队列 + 批量上报
 * 身份字段（userId/userGroup/anonymousId）一律不由前端提交，服务端补写。
 */
import type { EventName } from '@/lib/analytics/event-schema';

interface RawEvent {
  eventId: string;
  eventName: EventName;
  page: string;
  target?: string;
  props: Record<string, unknown>;
  clientTs: number;
  sessionId: string;
  pageInstanceId?: string;
  cmp?: string;
}

const FLUSH_INTERVAL_MS = 8000;
const FLUSH_AT = 20;
const SEND_LIMIT = 50;
const SESSION_IDLE_MS = 30 * 60 * 1000;

let queue: RawEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pageInstanceId: string | null = null;

export function setPageInstanceId(id: string): void {
  pageInstanceId = id;
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 兜底（老旧浏览器）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** 行为会话 ID：30 分钟无事件则切新；与 ChatSession 无关 */
function getSessionId(): string {
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem('ev_sess');
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; ts: number };
      if (now - parsed.ts < SESSION_IDLE_MS) {
        sessionStorage.setItem('ev_sess', JSON.stringify({ id: parsed.id, ts: now }));
        return parsed.id;
      }
    }
    const id = uuid();
    sessionStorage.setItem('ev_sess', JSON.stringify({ id, ts: now }));
    return id;
  } catch {
    return uuid();
  }
}

/** 提交一个行为事件；page 可显式指定（路由切换结算旧段时用旧路径） */
export function track(
  eventName: EventName,
  opts: { target?: string; props?: Record<string, unknown>; page?: string } = {},
): void {
  if (typeof window === 'undefined') return;
  queue.push({
    eventId: uuid(),
    eventName,
    page: opts.page ?? window.location.pathname,
    target: opts.target,
    props: opts.props ?? {},
    clientTs: Date.now(),
    sessionId: getSessionId(),
    pageInstanceId: pageInstanceId ?? undefined,
    cmp: new URLSearchParams(window.location.search).get('cmp') ?? undefined,
  });
  scheduleFlush();
  if (queue.length >= FLUSH_AT) void flush();
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.slice(0, SEND_LIMIT);
  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
    // 成功或服务端逐条拒绝（400）都清出队列；限流/服务端故障保留待重试
    if (res.ok || res.status === 400) {
      queue = queue.slice(batch.length);
    }
  } catch {
    // 网络异常，保留队列
  }
  if (queue.length > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

/** 页面卸载时用 sendBeacon 尽力发送（含活跃时长最后一段） */
export function flushBeacon(): void {
  if (typeof navigator === 'undefined' || queue.length === 0) return;
  const body = JSON.stringify({ events: queue.slice(0, SEND_LIMIT) });
  const sent =
    typeof navigator.sendBeacon === 'function' &&
    navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
  if (sent) {
    queue = queue.slice(Math.min(queue.length, SEND_LIMIT));
  } else {
    void flush();
  }
}
