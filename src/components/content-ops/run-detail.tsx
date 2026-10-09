'use client';

/**
 * 单导师龙虾流水线详情（§6.2/6.4）：头部 + VPN 条 + S0-S7 横向时间线 +
 * 阶段操作面板（A/B/C + S1/S2/S3/S7 卡）+ Agent 观察窗 + 产物清单 + 审计摘要。
 * 全部展示均为元数据（路径、哈希、计数、状态、时间、责任方）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RunDetail, RunEvent, RunListItem } from './types';
import { mentorColor, MENTOR_TERMINAL } from './mentor-lights-bar';
import { STEP_DEFS } from '@/lib/content-ops/state-machine';
import {
  FileRegisterCard,
  S3GateCard,
  ClaudePanelA,
  CodexPanelB,
  VerifyAssemblyCard,
  TraePanelC,
  Round1DocsQcPanel,
  Round1SendApprovalPanel,
  Round1ReplyPanel,
  Round1AbsorbPanel,
  Round2OutlinePanel,
  Round2MaterialPanel,
  Round2UpdatePanel,
  Round2DocsQcPanel,
  Round2ReplyPanel,
  FinalHandoffDiscoverPanel,
  PreflightNineChecksPanel,
  PendingDispositionPanel,
  G4GatePanel,
  S21IntegrationPanel,
  S22ProductionPanel,
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
  { code: 'S3', short: '门禁' },
  { code: 'S4', short: 'Claude' },
  { code: 'S5', short: '产物归档' },
  { code: 'S6', short: 'Codex' },
  { code: 'S7', short: '核验' },
  { code: 'S8', short: '阅览比对' },
  { code: 'S9', short: '批准发送' },
  { code: 'S10', short: '回复归档' },
  { code: 'S11', short: 'Codex吸收' },
  { code: 'S12', short: '二轮大纲' },
  { code: 'S13', short: '二轮材料' },
  { code: 'S14', short: 'Codex更新' },
  { code: 'S15', short: '二轮比对' },
  { code: 'S16', short: '二轮吸收' },
  { code: 'S17', short: 'Handoff' },
  { code: 'S18', short: '预检' },
  { code: 'S19', short: 'pending归零' },
  { code: 'S20', short: 'G4门禁' },
  { code: 'S21', short: 'Trae集成' },
  { code: 'S22', short: '生产发布' },
];

const AGENT_TABS = [
  { key: 'runner', label: 'Runner' },
  { key: 'feishu', label: '飞书' },
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
  { key: 'trae', label: 'Trae' },
] as const;

const EMPTY_AGENT_NOTE: Record<string, string> = {
  feishu: 'S9 批准发送后这里展示飞书连接器事件（探测/发送回执，仅元数据不含正文）。',
  claude: 'Claude 永久 manual_only，没有自动信号；人工动作在面板 A 登记，见审计摘要。',
  codex: '尚无 Codex 侧信号。S6 开始后这里展示投递/开始等事件。',
  trae: 'S20 G4 门禁通过前锁定只读；S21 集成与 S22 生产发布属 P4b 范围，暂不提供执行入口。',
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

/**
 * 步骤门禁：未到达（TIMELINE 索引 > currentIdx）的卡片整体变灰、禁止交互。
 * 按钮和链接通过 pointer-events-none 统一拦截；currentIdx=-1（全部完成）时不锁。
 */
function StepGate({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div aria-disabled="true" className="rounded-[18px]">
      <div className="pointer-events-none cursor-not-allowed opacity-45">{children}</div>
      <p className="-mt-1 px-1 text-[11px] text-stone-400">🔒 待前置步骤完成后激活</p>
    </div>
  );
}

export function RunDetailView({ initial, canWrite }: { initial: RunDetail; canWrite: boolean }) {
  const [run, setRun] = useState<RunDetail>(initial);
  const [mentors, setMentors] = useState<RunListItem[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<(typeof AGENT_TABS)[number]['key']>('runner');
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [runRes, runsRes] = await Promise.all([
        fetch(`/api/content-ops/runs/${initial.id}`, { cache: 'no-store' }),
        fetch('/api/content-ops/runs', { cache: 'no-store' }),
      ]);
      if (runRes.ok) setRun(await runRes.json());
      if (runsRes.ok) {
        const all = (await runsRes.json()).runs as RunListItem[];
        // 含当前 run 自己：每条详情页的 bar 上都能看到所有导师（含自己）的灯位
        setMentors(all.filter((r) => !MENTOR_TERMINAL.has(r.status)));
      }
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

  // 当前步索引：TIMELINE 中第一个非 done 的步骤（不存在的步骤视为 pending）；全部 done 时为 -1
  const currentIdx = TIMELINE.findIndex((n) => {
    const s = stepByCode[n.code];
    return (s?.status ?? 'pending') !== 'done';
  });
  /** 步骤码 → TIMELINE 索引；用于 StepGate 判定是否已到达 */
  const idxByCode = Object.fromEntries(TIMELINE.map((n, i) => [n.code, i])) as Record<string, number>;
  const gateLocked = (code: string) => currentIdx !== -1 && (idxByCode[code] ?? 999) > currentIdx;
  const vpnLevel = run.vpn?.hint?.level ?? 'gray';

  // 计算某节点的 VPN 小灯是否该亮：
  // 规则——需要 VPN 的节点，当它是「当前步」或「下一步」时亮灯；一旦越过该步
  // （currentIdx 后移）即变灰。颜色：VPN 开=亮绿，VPN 关=亮红，未知=灰。
  function vpnLampOf(sIdx: number, status: string): { lit: boolean; color: string; title: string } {
    const node = TIMELINE[sIdx];
    const def = STEP_DEFS.find((d) => d.code === node?.code);
    if (!def?.needsVpn) return { lit: false, color: '', title: '' };
    const lit = currentIdx !== -1 && (sIdx === currentIdx || sIdx === currentIdx + 1);
    if (!lit) {
      return { lit: false, color: 'bg-stone-400 text-white', title: '该步骤的 VPN 要求已通过' };
    }
    if (vpnLevel === 'green' || vpnLevel === 'amber') {
      return { lit: true, color: 'bg-lime-400 text-emerald-950', title: '该步骤需要 VPN，当前已开启' };
    }
    if (vpnLevel === 'red') {
      return { lit: true, color: 'bg-red-500 text-white', title: '该步骤需要 VPN，但当前未开启！' };
    }
    return { lit: true, color: 'bg-stone-400 text-white', title: '该步骤需要 VPN，状态无法探测' };
  }

  // 所有导师的进度彩灯：按 currentStepCode 分组，叠到对应节点上方
  const mentorsByStep = new Map<string, RunListItem[]>();
  for (const p of mentors) {
    const key = p.currentStepCode ?? 'S0';
    const arr = mentorsByStep.get(key) ?? [];
    arr.push(p);
    mentorsByStep.set(key, arr);
  }

  // 阶段面板路由：全部步骤始终渲染（pending 时只读/禁用），让用户下拉即可看到全流程
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
  // S1-S22 全部步骤始终渲染卡片；未到达的卡片由 StepGate 整体变灰、禁止交互
  const gate = (key: string, gateCode: string, node: React.ReactNode) => (
    <StepGate key={key} locked={gateLocked(gateCode)}>{node}</StepGate>
  );
  // S0 面板：飞书群搜索/机器人探测状态；失败时显示重试按钮
  const s0Step = stepByCode['S0'];
  if (s0Step && s0Step.commandStatus === 'failed') {
    panels.push(
      <div key="S0" className="rounded-[18px] border border-red-200 bg-red-50/40 p-4">
        <p className="text-sm font-semibold text-red-700">S0 · 飞书群绑定失败</p>
        <p className="mt-1 text-xs text-red-600">{s0Step.failureReason ?? '未知原因'}</p>
        {canWrite && (
          <button
            type="button"
            onClick={() => onAction('retry-command', { stepCode: 'S0' })}
            className="mt-2 rounded-md border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
          >
            重试该指令
          </button>
        )}
      </div>,
    );
  } else if (s0Step && (s0Step.commandStatus === 'queued' || s0Step.commandStatus === 'dispatched')) {
    panels.push(
      <div key="S0" className="rounded-[18px] border border-stone-200 bg-stone-50/40 p-4">
        <p className="text-sm text-stone-600">S0 · 飞书群搜索/机器人探测进行中…</p>
      </div>,
    );
  }
  panels.push(gate('S1', 'S1', <FileRegisterCard run={run} code="S1" onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S2', 'S2', <FileRegisterCard run={run} code="S2" onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S3', 'S3', <S3GateCard run={run} />));
  panels.push(gate('A', 'S4', <ClaudePanelA run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('B', 'S6', <CodexPanelB run={run} onAction={onAction} canWrite={canWrite && st !== 'round1_docs_qc'} />));
  panels.push(gate('S7', 'S7', <VerifyAssemblyCard run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S8', 'S8', <Round1DocsQcPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S9', 'S9', <Round1SendApprovalPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S10', 'S10', <Round1ReplyPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S11', 'S11', <Round1AbsorbPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S12', 'S12', <Round2OutlinePanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S13', 'S13', <Round2MaterialPanel run={run} onAction={onAction} canWrite={canWrite} />));
  // S13 完成后开放归档补登（与 S13 同步解锁/锁定）
  panels.push(gate('S13-merge', 'S13', <FileRegisterCard run={run} code="S13" onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S14', 'S14', <Round2UpdatePanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S15', 'S15', <Round2DocsQcPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S16', 'S16', <Round2ReplyPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S17', 'S17', <FinalHandoffDiscoverPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S18', 'S18', <PreflightNineChecksPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S19', 'S19', <PendingDispositionPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S20', 'S20', <G4GatePanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(gate('S21', 'S21', <S21IntegrationPanel run={run} canWrite={canWrite} />));
  panels.push(gate('S22', 'S22', <S22ProductionPanel run={run} onAction={onAction} canWrite={canWrite} />));
  panels.push(<TraePanelC key="C" run={run} />);

  // 观察窗事件
  const tabEvents = run.events.filter((e) => e.agent === tab);
  const heartbeats = tabEvents.filter((e) => e.type === 'heartbeat');
  const nonHb = tabEvents.filter((e) => e.type !== 'heartbeat');

  // 机器人进群状态（S0 附带探测，软提示；探测指令在建 Run 且已填群 ID 时自动下发一次）
  const s0Evidence = (run.steps.find((s) => s.code === 'S0')?.evidence ?? null) as
    | { botCheck?: { bots?: Array<{ name: string | null }>; truncated?: boolean } }
    | null;
  let botChip: React.ReactNode = null;
  if (s0Evidence?.botCheck) {
    const bots = s0Evidence.botCheck.bots;
    if (Array.isArray(bots)) {
      const inGroup = bots.some((b) => (b.name ?? '').includes('榨职机'));
      botChip = inGroup ? (
        <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">榨职机助手在群</span>
      ) : (
        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
          榨职机助手未在群 · S10 抓取/S12 发送受限
        </span>
      );
    } else {
      botChip = <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">机器人探测中…</span>;
    }
  }

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
              飞书群：{run.feishuChatName ?? '—'}{botChip} · Runner：
              {run.runner ? `${run.runner.online ? '● 在线' : '○ 离线'}（${run.runner.name} · ${timeAgo(run.runner.lastSeenAt, now)}）` : '未绑定'}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-stone-800">● {labelOf(RUN_STATUS_LABELS, run.status)}</p>
            <p className="mt-0.5 text-xs text-stone-400">当前责任方：{labelOf(OWNER_LABELS, run.currentOwner)}</p>
          </div>
        </header>

        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
        {run.status === 'failed' && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            Run 处于失败干预态：按下方失败步骤卡片中的「重试该指令 / 重新验证」恢复，历史保留不覆盖。
          </div>
        )}

        {/* 横向时间线（全宽 sticky 冻结，下拉时浮顶可见） */}
        <ol className="letter-paper sticky top-0 z-30 mb-4 rounded-[18px] p-3 shadow-sm">
          {/* 第一行：S0-S11 */}
          <li className="flex items-center">
            {TIMELINE.slice(0, 12).map((node, i) => {
              const s = stepByCode[node.code];
              const status = s?.status ?? 'pending';
              const { color: lampColor, title: lampTitle } = vpnLampOf(i, status);
              const icon =
                status === 'done' ? '✓' : status === 'failed' ? '✕' : status === 'running' ? '…' : status === 'waiting_human' ? '✋' : i;
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
                <span key={node.code} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-0.5">
                    {/* 其他导师彩灯：叠在节点上方 */}
                    <div className="flex flex-wrap justify-center gap-0.5" style={{ minHeight: 10 }}>
                      {(mentorsByStep.get(node.code) ?? []).map((p) => (
                        <span
                          key={p.id}
                          title={`${p.mentorDir} · ${p.status}`}
                          className="inline-block rounded-full ring-1 ring-white"
                          style={{ width: 9, height: 9, backgroundColor: mentorColor(p.mentorDir) }}
                        />
                      ))}
                    </div>
                    <span className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${cls}`}>
                      {icon}
                      {lampColor && (
                        <span
                          className={`absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white text-[8px] font-bold leading-none ${lampColor}`}
                          title={lampTitle}
                        >
                          v
                        </span>
                      )}
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-stone-500">
                      {node.code} {node.short}
                    </span>
                  </div>
                  {i < 11 && <span className="mx-0.5 h-px flex-1 bg-stone-200" />}
                </span>
              );
            })}
          </li>
          {/* 第二行：S12-S22 */}
          <li className="mt-2 flex items-center">
            {TIMELINE.slice(12).map((node, i) => {
              const s = stepByCode[node.code];
              const status = s?.status ?? 'pending';
              const absIdx = i + 12;
              const { color: lampColor, title: lampTitle } = vpnLampOf(absIdx, status);
              const icon =
                status === 'done' ? '✓' : status === 'failed' ? '✕' : status === 'running' ? '…' : status === 'waiting_human' ? '✋' : absIdx;
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
                <span key={node.code} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-0.5">
                    {/* 其他导师彩灯：叠在节点上方 */}
                    <div className="flex flex-wrap justify-center gap-0.5" style={{ minHeight: 10 }}>
                      {(mentorsByStep.get(node.code) ?? []).map((p) => (
                        <span
                          key={p.id}
                          title={`${p.mentorDir} · ${p.status}`}
                          className="inline-block rounded-full ring-1 ring-white"
                          style={{ width: 9, height: 9, backgroundColor: mentorColor(p.mentorDir) }}
                        />
                      ))}
                    </div>
                    <span className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${cls}`}>
                      {icon}
                      {lampColor && (
                        <span
                          className={`absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white text-[8px] font-bold leading-none ${lampColor}`}
                          title={lampTitle}
                        >
                          v
                        </span>
                      )}
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-stone-500">
                      {node.code} {node.short}
                    </span>
                  </div>
                  {i < TIMELINE.length - 13 && <span className="mx-0.5 h-px flex-1 bg-stone-200" />}
                </span>
              );
            })}
          </li>
        </ol>

        {/* 导师彩灯图例：色点 = 导师英文名，位置 = 当前进度步骤 */}
        {mentors.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2">
            <span className="text-[11px] font-semibold text-stone-500">导师进度</span>
            {mentors.map((p) => (
              <Link
                key={p.id}
                href={`/content-ops/runs/${p.id}`}
                className="flex items-center gap-1.5 text-xs text-stone-700 hover:underline"
                title={p.status}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 10, height: 10, backgroundColor: mentorColor(p.mentorDir) }}
                />
                <span className="font-medium">{p.mentorDir}</span>
                <span className="text-stone-400">·</span>
                <span className="text-stone-500">{p.currentStepCode ?? 'S0'}</span>
              </Link>
            ))}
          </div>
        )}

        {/* 阶段面板（左栏可滚动） + 右栏（sticky 始终可见） */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="max-h-[calc(100vh-7rem)] space-y-4 overflow-y-auto">{panels}</div>

          {/* 右栏：Agent 观察窗（sticky 始终可见，不被进度 bar 遮住） */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
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
