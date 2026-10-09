'use client';

/**
 * 龙虾工作台总览（§6.1）：Runner 状态 + 全局 VPN 条 + 导师流水线列表 + 待人工队列/告警。
 * 只读账号（CONTENT_VIEWER）不显示「新建 Run」。
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { RunListItem, RunnerInfo } from './types';
import { CreateRunWizard } from './create-run-wizard';
import { MentorLightsBar } from './mentor-lights-bar';
import { RUN_STATUS_LABELS, OWNER_LABELS, labelOf, timeAgo } from './display-labels';

const POLL_MS = 15000;

// 需要人工介入的状态（P1 S0-S7 范围内可能出现的）
const ATTENTION_STATES = new Set([
  'waiting_runner',
  'vpn_check_failed',
  'waiting_human_input',
  'failed',
  'interrupted_resumable',
]);

export function ContentOpsConsole({
  accountName,
  canWrite,
  envLabel,
}: {
  accountName: string;
  canWrite: boolean;
  envLabel: string;
}) {
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [deleteTarget, setDeleteTarget] = useState<RunListItem | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/content-ops/runs/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `删除失败（${res.status}）`);
      }
      const removedId = deleteTarget.id;
      setRuns((prev) => (prev ? prev.filter((x) => x.id !== removedId) : prev));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const refresh = useCallback(async () => {
    try {
      const [runsRes, runnersRes] = await Promise.all([
        fetch('/api/content-ops/runs', { cache: 'no-store' }),
        fetch('/api/content-ops/runners', { cache: 'no-store' }),
      ]);
      if (runsRes.ok) setRuns((await runsRes.json()).runs as RunListItem[]);
      if (runnersRes.ok) setRunners((await runnersRes.json()).runners as RunnerInfo[]);
    } catch {
      setLoadError('数据加载失败，将在下次轮询重试');
    } finally {
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, [refresh]);

  const onlineRunner = runners.find((r) => r.online) ?? null;
  const attention = (runs ?? []).filter((r) => ATTENTION_STATES.has(r.status));

  return (
    <div className="min-h-screen bg-bg cream-foil">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {/* 顶栏 */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-xl font-bold text-ink">🦞 导师访谈龙虾工作台</h1>
            <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-white">
              {envLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-stone-600">
            <span>
              Runner：
              {onlineRunner ? (
                <span className="font-medium text-emerald-700">
                  ● 在线（{onlineRunner.name} · {timeAgo(onlineRunner.lastSeenAt, now)}）
                </span>
              ) : (
                <span className="font-medium text-stone-500">○ 离线</span>
              )}
            </span>
            <span className="text-stone-300">|</span>
            <span>{accountName}</span>
          </div>
        </header>

        {loadError && <p className="mb-3 text-xs text-red-600">{loadError}</p>}

        {runs && runs.length > 0 && (
          <div className="mb-4">
            <MentorLightsBar runs={runs} />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[1fr_340px]">
          {/* 左：流水线列表 */}
          <section className="letter-paper rounded-[18px] p-4">
            <h2 className="mb-3 text-sm font-bold text-stone-700">导师流水线</h2>
            {runs === null ? (
              <p className="py-8 text-center text-sm text-stone-400">加载中...</p>
            ) : runs.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">
                还没有 Run。登录后点右上角「🦞 新建导师龙虾 Run」开始。
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-stretch gap-1">
                    <Link
                      href={`/content-ops/runs/${r.id}`}
                      className="flex flex-1 items-center justify-between gap-3 py-3 hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-800">
                          {r.mentorDir}
                          {r.isPilot && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              试点
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-400">
                          飞书群：{r.feishuChatName ?? '—'} · 建 {timeAgo(r.createdAt, now)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-xs font-medium ${
                            ATTENTION_STATES.has(r.status) ? 'text-red-600' : 'text-stone-700'
                          }`}
                        >
                          ● {labelOf(RUN_STATUS_LABELS, r.status)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-400">
                          责任方：{labelOf(OWNER_LABELS, r.currentOwner)}
                        </p>
                      </div>
                    </Link>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(r);
                          setDeleteError('');
                        }}
                        className="shrink-0 self-center rounded-md px-2 py-1 text-xs text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`删除 ${r.mentorDir} 流水线记录`}
                      >
                        删除
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 右：操作区 */}
          <aside className="space-y-4">
            {canWrite && (
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="btn-primary w-full"
              >
                🦞 新建导师龙虾 Run
              </button>
            )}

            <section className="letter-paper rounded-[18px] p-4">
              <h2 className="mb-2 text-sm font-bold text-stone-700">待人工处理</h2>
              {attention.length === 0 ? (
                <p className="py-4 text-center text-xs text-stone-400">当前没有待处理项</p>
              ) : (
                <ul className="space-y-2">
                  {attention.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/content-ops/runs/${r.id}`}
                        className="block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 hover:opacity-85"
                      >
                        <span className="font-semibold">{r.mentorDir}</span> ·{' '}
                        {labelOf(RUN_STATUS_LABELS, r.status)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="letter-paper rounded-[18px] p-4">
              <h2 className="mb-2 text-sm font-bold text-stone-700">Runner</h2>
              {runners.length === 0 ? (
                <p className="text-xs text-stone-400">尚无 Runner 注册记录。</p>
              ) : (
                <ul className="space-y-1.5 text-xs text-stone-600">
                  {runners.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {r.online ? '●' : '○'} {r.name}{' '}
                        <span className="text-stone-400">v{r.version}</span>
                      </span>
                      <span className="shrink-0 text-stone-400">{timeAgo(r.lastSeenAt, now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>

      {wizardOpen && (
        <CreateRunWizard runners={runners} onClose={() => setWizardOpen(false)} />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 px-4 py-20"
          onClick={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <div
            className="letter-paper w-full max-w-md rounded-[20px] p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="删除流水线记录确认"
          >
            <h2 className="mb-3 font-serif text-lg font-bold text-ink">删除流水线记录</h2>
            <p className="mb-2 text-sm leading-relaxed text-stone-700">
              将删除「<span className="font-semibold text-stone-900">{deleteTarget.mentorDir}</span>
              」这条 Run 的全部数据库记录：所有步骤节点、产物登记、事件流、门禁审批与飞书发送登记，删除后不可恢复。
            </p>
            <p className="mb-4 text-xs leading-relaxed text-stone-500">
              D 盘文件、飞书群消息、Codex / Claude / Trae 的对话内容均不受影响。
            </p>
            {deleteError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
