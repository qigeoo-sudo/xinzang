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
      const res = await fetch('/api/content-ops/runners/restart', { method: 'POST' });
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
