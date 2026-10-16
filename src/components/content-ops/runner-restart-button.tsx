'use client';

import { useState } from 'react';

/**
 * 一键重启本机 Runner（2026-10-16 方案A：网页按钮 → 本地 API 拉新进程，
 * Runner 自带 PID 守卫会先杀旧实例）。仅本地环境有效；生产环境 API 返回 403。
 */
export function RunnerRestartButton({ onRestarted }: { onRestarted?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function restart() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      // 8 秒超时：dev server 未启动时 fetch 会长时间挂起（2026-10-16 电脑重启后
      // 用户对着缓存页面点按钮，干等 60 秒才超时报错）。主动短超时给出可操作提示。
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      let res: Response;
      try {
        res = await fetch('/api/content-ops/runners/restart', { method: 'POST', signal: ctrl.signal });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw new Error('本地服务无响应，请确认已在终端执行 npm run dev');
        }
        throw new Error('连不上本地服务，请确认已在终端执行 npm run dev');
      } finally {
        clearTimeout(timer);
      }
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setNote('已拉起新进程，等心跳转绿…');
      onRestarted?.();
    } catch (e) {
      setNote(e instanceof Error ? `重启失败：${e.message}` : '重启失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={restart}
        disabled={busy}
        className="rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-50"
        title="终止旧 Runner 进程并在本机重新拉起（仅本地环境）"
      >
        {busy ? '重启中…' : '重启 Runner'}
      </button>
      {note && <span className="text-[11px] text-stone-500">{note}</span>}
    </span>
  );
}
