'use client';

/**
 * 单导师龙虾流水线详情（§6.2/6.4）：头部 + VPN 条 + S0-S7 横向时间线 +
 * 阶段操作面板（A/B/C + S1/S2/S3/S7 卡）+ Agent 观察窗 + 产物清单 + 审计摘要。
 * 全部展示均为元数据（路径、哈希、计数、状态、时间、责任方）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RunDetail, RunEvent } from './types';
import { VpnBanner } from './vpn-banner';
import {
  FileRegisterCard,
  S3GateCard,
  ClaudePanelA,
  CodexPanelB,
  VerifyAssemblyCard,
  TraePanelC,
  Round1DocsQcPanel,
  Round1SendApprovalPanel,
} from './panels';
import {
  RUN_STATUS_LABELS,
  OWNER_LABELS,
  STEP_STATUS_LABELS,
  AGENT_LABELS,
  ARTIFACT_KIND_LABELS,
  labelOf,
  timeAgo,
} from './display-labels';

const TIMELINE: Array<{ code: string; short: string }> = [
  { code: 'S0', short: '建 Run' },
  { code: 'S1', short: '材料' },
  { code: 'S2', short: '归档' },
  { code: 'S3', short: 'VPN' },
  { code: 'S4', short: 'Claude' },
  { code: 'S5', short: '产物归档' },
  { code: 'S6', short: 'Codex' },
  { code: 'S7', short: '核验' },
  { code: 'S8', short: '阅览比对' },
  { code: 'S9', short: '批准发送' },
];

const AGENT_TABS = [
  { key: 'runner', label: 'Runner' },
  { key: 'feishu', label: '飞书' },
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
  { key: 'trae', label: 'Trae（锁定）' },
] as const;

const EMPTY_AGENT_NOTE: Record<string, string> = {
  feishu: 'S9 批准发送后这里展示飞书连接器事件（探测/发送回执，仅元数据不含正文）。',
  claude: 'Claude 永久 manual_only，没有自动信号；人工动作在面板 A 登记，见审计摘要。',
  codex: '尚无 Codex 侧信号。S6 开始后这里展示投递/开始等事件。',
  trae: 'Trae 合同区在 S20 第一次门禁前锁定，P1（S0-S7）无活动。',
};

function EventLine({ e }: { e: RunEvent }) {
  const payload = e.payload as Record<string, unknown>;
  let detail = '';
  if (e.type === 'heartbeat') detail = '心跳探测';
  else if (e.type === 'result') detail = JSON.stringify(payload);
  else detail = JSON.stringify(payload);
  return (
    <li className="flex items-start gap-2 py-1.5 text-xs">
      <span className="shrink-0 text-stone-400">{new Date(e.createdAt).toLocaleString('zh-CN')}</span>
      <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">{e.type}</span>
      <span className="min-w-0 break-all text-stone-600">{detail}</span>
    </li>
  );
}

export function RunDetailView({ initial, canWrite }: { initial: RunDetail; canWrite: boolean }) {
  const [run, setRun] = useState<RunDetail>(initial);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<(typeof AGENT_TABS)[number]['key']>('runner');
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/content-ops/runs/${initial.id}`, { cache: 'no-store' });
      if (res.ok) setRun(await res.json());
    } catch {
      /* 轮询失败保留下一次重试 */
    } finally {
      setNow(Date.now());
    }
  }, [initial.id]);

  useEffect(() => {
    const busy = run.steps.some((s) => s.commandStatus === 'queued' || s.commandStatus === 'dispatched');
    timer.current = setInterval(refresh, busy ? 4000 : 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh, run.steps]);

  const onAction = useCallback(
    async (subPath: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/content-ops/runs/${initial.id}/${subPath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `操作失败（${res.status}）`);
      await refresh();
    },
    [initial.id, refresh],
  );

  const stepByCode = Object.fromEntries(run.steps.map((s) => [s.code, s]));

  // 阶段面板路由（P1 S0-S7）
  const panels: React.ReactNode[] = [];
  const st = run.status;
  if (st === 'waiting_runner') {
    panels.push(
      <section key="wait" className="letter-paper rounded-[18px] p-4 text-sm text-stone-600">
        Run 已建立，等待 Windows Runner 首次心跳自动接上（不会自动过期）。请在 Windows 上启动：
        <code className="mt-2 block rounded bg-stone-50 p-2 text-xs">node runner/src/index.mjs</code>
      </section>,
    );
  }
  if (['waiting_round1_submission', 'round1_material_received', 'round1_archiving', 'failed'].includes(st) ||
      stepByCode.S1?.status !== 'done') {
    if (stepByCode.S1 && stepByCode.S1.status !== 'done') {
      panels.push(<FileRegisterCard key="S1" run={run} code="S1" onAction={onAction} canWrite={canWrite} />);
    }
  }
  if (stepByCode.S1?.status === 'done' && stepByCode.S2?.status !== 'done') {
    panels.push(<FileRegisterCard key="S2" run={run} code="S2" onAction={onAction} canWrite={canWrite} />);
  }
  if (['round1_archived', 'vpn_check_failed'].includes(st) || stepByCode.S3?.status === 'failed') {
    panels.push(<S3GateCard key="S3" run={run} />);
  }
  if (
    ['claude_manual_step', 'claude_output_archived', 'codex_round1_assembly', 'round1_docs_qc'].includes(st) ||
    stepByCode.S4?.status === 'running' ||
    stepByCode.S5?.status === 'waiting_human'
  ) {
    panels.push(<ClaudePanelA key="A" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['claude_output_archived', 'codex_round1_assembly', 'round1_docs_qc'].includes(st) ||
    stepByCode.S6?.status === 'running' ||
    stepByCode.S6?.status === 'done'
  ) {
    panels.push(<CodexPanelB key="B" run={run} onAction={onAction} canWrite={canWrite && st !== 'round1_docs_qc'} />);
  }
  if (['codex_round1_assembly', 'round1_docs_qc', 'failed'].includes(st) || stepByCode.S7?.status !== 'pending') {
    if (stepByCode.S6?.status === 'running' || stepByCode.S6?.status === 'done' || stepByCode.S7?.status !== 'pending') {
      panels.push(<VerifyAssemblyCard key="S7" run={run} onAction={onAction} canWrite={canWrite} />);
    }
  }
  if (
    ['round1_docs_qc', 'round1_docs_qc_failed', 'awaiting_send_approval_round1_docs'].includes(st) ||
    (stepByCode.S8 && !['pending', 'done'].includes(stepByCode.S8.status))
  ) {
    panels.push(<Round1DocsQcPanel key="S8" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['awaiting_send_approval_round1_docs', 'round1_docs_sent'].includes(st) ||
    (stepByCode.S9 && !['pending', 'done'].includes(stepByCode.S9.status))
  ) {
    panels.push(<Round1SendApprovalPanel key="S9" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  panels.push(<TraePanelC key="C" />);

  // 观察窗事件
  const tabEvents = run.events.filter((e) => e.agent === tab);
  const heartbeats = tabEvents.filter((e) => e.type === 'heartbeat');
  const nonHb = tabEvents.filter((e) => e.type !== 'heartbeat');

  return (
    <div className="min-h-screen bg-bg cream-foil">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <Link href="/content-ops" className="text-xs text-stone-500 hover:underline">
          ← 返回总览
        </Link>

        {/* 头部 */}
        <header className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-bold text-ink">
              {run.mentorDir}
              {run.isPilot && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  试点
                </span>
              )}
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              飞书群：{run.feishuChatName ?? '—'} · Runner：
              {run.runner ? `${run.runner.online ? '● 在线' : '○ 离线'}（${run.runner.name} · ${timeAgo(run.runner.lastSeenAt, now)}）` : '未绑定'}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-stone-800">● {labelOf(RUN_STATUS_LABELS, run.status)}</p>
            <p className="mt-0.5 text-xs text-stone-400">当前责任方：{labelOf(OWNER_LABELS, run.currentOwner)}</p>
          </div>
        </header>

        <div className="mb-4">
          <VpnBanner hint={run.vpn.hint} onReprobe={refresh} />
        </div>

        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
        {run.status === 'failed' && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            Run 处于失败干预态：按下方失败步骤卡片中的「重试该指令 / 重新验证」恢复，历史保留不覆盖。
          </div>
        )}

        {/* 横向时间线 */}
        <ol className="letter-paper mb-4 flex items-center overflow-x-auto rounded-[18px] p-4">
          {TIMELINE.map((node, i) => {
            const s = stepByCode[node.code];
            const status = s?.status ?? 'pending';
            const icon =
              status === 'done' ? '✓' : status === 'failed' ? '✕' : status === 'running' ? '…' : status === 'waiting_human' ? '✋' : i + 1;
            const cls =
              status === 'done'
                ? 'bg-emerald-500 text-white'
                : status === 'failed'
                  ? 'bg-red-500 text-white'
                  : status === 'running'
                    ? 'bg-amber-400 text-white'
                    : status === 'waiting_human'
                      ? 'bg-violet-500 text-white'
                      : 'bg-stone-200 text-stone-500';
            return (
              <li key={node.code} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${cls}`}>
                    {icon}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-stone-500">
                    {node.code} {node.short}
                  </span>
                </div>
                {i < TIMELINE.length - 1 && <span className="mx-1 h-px flex-1 bg-stone-200" />}
              </li>
            );
          })}
        </ol>

        {/* 阶段面板 */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">{panels}</div>

          {/* 右栏：Agent 观察窗 */}
          <aside className="space-y-4">
            <section className="letter-paper rounded-[18px] p-4">
              <h2 className="mb-2 text-sm font-bold text-stone-700">Agent 观察窗</h2>
              <div className="mb-2 flex flex-wrap gap-1">
                {AGENT_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      tab === t.key ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto">
                {tab === 'runner' && heartbeats.length > 0 && (
                  <li className="py-1.5 text-xs text-stone-400">
                    心跳共 {heartbeats.length} 次（最近 {new Date(heartbeats[0].createdAt).toLocaleString('zh-CN')}），已折叠
                  </li>
                )}
                {nonHb.slice(0, 20).map((e) => (
                  <EventLine key={e.id} e={e} />
                ))}
                {tabEvents.length === 0 || (tab === 'runner' && nonHb.length === 0 && heartbeats.length === 0) ? (
                  <li className="py-4 text-center text-xs text-stone-400">
                    {tab === 'runner' && nonHb.length === 0 && heartbeats.length > 0
                      ? '除心跳外暂无事件'
                      : EMPTY_AGENT_NOTE[tab] ?? '暂无事件'}
                  </li>
                ) : tab === 'runner' && nonHb.length === 0 ? (
                  <li className="py-2 text-center text-xs text-stone-400">除心跳外暂无事件</li>
                ) : null}
              </ul>
            </section>

            {/* 产物清单 */}
            <section className="letter-paper rounded-[18px] p-4">
              <h2 className="mb-2 text-sm font-bold text-stone-700">产物与证据（{run.artifacts.length}）</h2>
              {run.artifacts.length === 0 ? (
                <p className="py-3 text-center text-xs text-stone-400">尚未登记任何文件哈希</p>
              ) : (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {run.artifacts.map((a) => (
                    <li key={a.id} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs">
                      <p className="truncate font-medium text-stone-700" title={a.displayPath}>{a.displayPath}</p>
                      <p className="mt-0.5 text-stone-400">
                        {labelOf(ARTIFACT_KIND_LABELS, a.kind)} · {a.sha256.slice(0, 10)}… · {Number(a.bytes).toLocaleString()} B
                        {a.immutable && <span className="ml-1 text-emerald-600">原件不可变</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>

        {/* 审计摘要 */}
        <section className="letter-paper mt-4 rounded-[18px] p-4">
          <h2 className="mb-2 text-sm font-bold text-stone-700">审计摘要（最近 {run.events.length} 条）</h2>
          <ul className="divide-y divide-stone-100">
            {run.events.slice(0, 12).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                <span className="shrink-0 text-stone-400">{new Date(e.createdAt).toLocaleString('zh-CN')}</span>
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5">{labelOf(AGENT_LABELS, e.agent)}</span>
                <span className="shrink-0 text-stone-500">{e.type}</span>
                <span className="min-w-0 break-all text-stone-400">{JSON.stringify(e.payload)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
