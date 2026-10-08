'use client';

/**
 * 单导师龙虾流水线详情（§6.2/6.4）：头部 + VPN 条 + S0-S7 横向时间线 +
 * 阶段操作面板（A/B/C + S1/S2/S3/S7 卡）+ Agent 观察窗 + 产物清单 + 审计摘要。
 * 全部展示均为元数据（路径、哈希、计数、状态、时间、责任方）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RunDetail, RunEvent, RunListItem } from './types';
import { VpnBanner } from './vpn-banner';
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

  // 所有导师的进度彩灯：按 currentStepCode 分组，叠到对应节点上方
  const mentorsByStep = new Map<string, RunListItem[]>();
  for (const p of mentors) {
    const key = p.currentStepCode ?? 'S0';
    const arr = mentorsByStep.get(key) ?? [];
    arr.push(p);
    mentorsByStep.set(key, arr);
  }

  // 阶段面板路由（P1 S0-S7 → P4a S17-S20）
  // 已完成步骤面板持续显示（只读），让用户下拉时能看到全流程进展
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
  // S1：step 存在即显示（done 后只读）
  if (stepByCode.S1) {
    panels.push(<FileRegisterCard key="S1" run={run} code="S1" onAction={onAction} canWrite={canWrite} />);
  }
  // S2：S1 完成后显示（done 后只读）
  if (stepByCode.S1?.status === 'done' && stepByCode.S2) {
    panels.push(<FileRegisterCard key="S2" run={run} code="S2" onAction={onAction} canWrite={canWrite} />);
  }
  // S3：VPN 检查，step 存在即显示（done/failed 后只读）
  if (stepByCode.S3) {
    panels.push(<S3GateCard key="S3" run={run} />);
  }
  // S4/S5（Claude 面板 A）：step 存在即显示
  if (stepByCode.S4 || stepByCode.S5) {
    panels.push(<ClaudePanelA key="A" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  // S6（Codex 面板 B）：step 存在即显示
  if (stepByCode.S6) {
    panels.push(<CodexPanelB key="B" run={run} onAction={onAction} canWrite={canWrite && st !== 'round1_docs_qc'} />);
  }
  // S7：核验，step 存在即显示
  if (stepByCode.S7) {
    panels.push(<VerifyAssemblyCard key="S7" run={run} onAction={onAction} canWrite={canWrite} />);
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
  if (
    ['round1_docs_sent', 'waiting_round1_review_reply', 'round1_reply_received', 'codex_round1_absorb'].includes(st) ||
    (stepByCode.S10 && stepByCode.S10.status !== 'pending')
  ) {
    panels.push(<Round1ReplyPanel key="S10" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (['round1_reply_received', 'codex_round1_absorb'].includes(st) || (stepByCode.S11 && stepByCode.S11.status !== 'pending')) {
    panels.push(<Round1AbsorbPanel key="S11" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['codex_round1_absorb', 'round2_outline_sent', 'waiting_round2_submission', 'round2_material_received'].includes(st) ||
    (stepByCode.S12 && stepByCode.S12.status !== 'pending')
  ) {
    panels.push(<Round2OutlinePanel key="S12" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['round2_outline_sent', 'waiting_round2_submission', 'round2_material_received', 'codex_round2_update'].includes(st) ||
    (stepByCode.S13 && stepByCode.S13.status !== 'pending')
  ) {
    panels.push(<Round2MaterialPanel key="S13" run={run} onAction={onAction} canWrite={canWrite} />);
    // S13 完成后开放归档补登（与 S2 同构：多源文件时登记 round2 full interview/transcript 归并稿）
    if (stepByCode.S13?.status === 'done' || stepByCode.S13?.status === 'failed') {
      panels.push(<FileRegisterCard key="S13-merge" run={run} code="S13" onAction={onAction} canWrite={canWrite} />);
    }
  }
  if (
    ['round2_material_received', 'codex_round2_update', 'round2_docs_qc', 'round2_docs_qc_failed'].includes(st) ||
    (stepByCode.S14 && stepByCode.S14.status !== 'pending')
  ) {
    panels.push(<Round2UpdatePanel key="S14" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    [
      'round2_docs_qc',
      'round2_docs_qc_failed',
      'awaiting_send_approval_round2_docs',
      'round2_docs_sent',
      'waiting_round2_review_reply',
      'round2_reply_received',
      'codex_final_absorb',
    ].includes(st) ||
    (stepByCode.S15 && stepByCode.S15.status !== 'pending')
  ) {
    panels.push(<Round2DocsQcPanel key="S15" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['round2_docs_sent', 'waiting_round2_review_reply', 'round2_reply_received', 'codex_final_absorb'].includes(st) ||
    (stepByCode.S16 && stepByCode.S16.status !== 'pending')
  ) {
    panels.push(<Round2ReplyPanel key="S16" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  // P4a：S17-S20 Final Handoff 发现 → 九类预检 → pending 归零 → G4 第一次门禁
  if (
    ['codex_final_absorb', 'final_handoff_discovered', 'final_handoff_preflight', 'final_handoff_blocked', 'ready_for_integration', 'awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(st) ||
    (stepByCode.S17 && stepByCode.S17.status !== 'pending')
  ) {
    panels.push(<FinalHandoffDiscoverPanel key="S17" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['final_handoff_preflight', 'final_handoff_blocked', 'ready_for_integration', 'awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(st) ||
    (stepByCode.S18 && stepByCode.S18.status !== 'pending')
  ) {
    panels.push(<PreflightNineChecksPanel key="S18" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['ready_for_integration', 'awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(st) ||
    (stepByCode.S19 && stepByCode.S19.status !== 'pending')
  ) {
    panels.push(<PendingDispositionPanel key="S19" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  if (
    ['awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(st) ||
    (stepByCode.S20 && stepByCode.S20.status !== 'pending')
  ) {
    panels.push(<G4GatePanel key="S20" run={run} onAction={onAction} canWrite={canWrite} />);
  }
  // P4b：S21 Trae 集成（六段自动串联） + S22 生产发布（G5 门禁 + 四段自动）
  if (
    ['reconciling_snapshots', 'integration_backup_created', 'integrating_application', 'testing_staging', 'pushing_main', 'deploying_staging', 'awaiting_staging_acceptance', 'production_failed_rolled_back'].includes(st) ||
    (stepByCode.S21 && stepByCode.S21.status !== 'pending')
  ) {
    panels.push(<S21IntegrationPanel key="S21" run={run} canWrite={canWrite} />);
  }
  if (
    ['awaiting_staging_acceptance', 'production_approval_granted', 'locking_accepted_main_sha', 'promoting_main_to_master', 'deploying_production', 'verifying_production', 'completed', 'production_failed_rolled_back'].includes(st) ||
    (stepByCode.S22 && stepByCode.S22.status !== 'pending')
  ) {
    panels.push(<S22ProductionPanel key="S22" run={run} onAction={onAction} canWrite={canWrite} />);
  }
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

        <div className="mb-4">
          <VpnBanner hint={run.vpn.hint} onReprobe={refresh} />
        </div>

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
              const def = STEP_DEFS.find((d) => d.code === node.code);
              const needsVpn = def?.needsVpn ?? false;
              const vpnLevel = run.vpn?.hint?.level ?? 'gray';
              // VPN 小灯：只有当前活跃步骤（running/waiting_human/failed）才显示蓝/红；done 和 pending 都是灰
              const stepActive = status === 'running' || status === 'waiting_human' || status === 'failed';
              const lampColor = !needsVpn
                ? ''
                : !stepActive
                  ? 'bg-stone-400 text-white'
                  : (vpnLevel === 'green' || vpnLevel === 'amber')
                    ? 'bg-blue-500 text-white'
                    : vpnLevel === 'red'
                      ? 'bg-red-500 text-white'
                      : 'bg-stone-400 text-white';
              const lampTitle = !needsVpn
                ? ''
                : !stepActive
                  ? status === 'done' ? '该步骤已完成（VPN 信号不再相关）' : '该步骤建议开启 VPN（尚未轮到）'
                  : vpnLevel === 'green'
                    ? 'VPN 已开启'
                    : vpnLevel === 'red'
                      ? '需要 VPN 但未开启'
                      : vpnLevel === 'amber'
                        ? 'VPN 已开（建议按需关闭）'
                        : 'VPN 状态无法探测';
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
                      {needsVpn && (
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
              const def = STEP_DEFS.find((d) => d.code === node.code);
              const needsVpn = def?.needsVpn ?? false;
              const vpnLevel = run.vpn?.hint?.level ?? 'gray';
              const stepActive = status === 'running' || status === 'waiting_human' || status === 'failed';
              const lampColor = !needsVpn
                ? ''
                : !stepActive
                  ? 'bg-stone-400 text-white'
                  : (vpnLevel === 'green' || vpnLevel === 'amber')
                    ? 'bg-blue-500 text-white'
                    : vpnLevel === 'red'
                      ? 'bg-red-500 text-white'
                      : 'bg-stone-400 text-white';
              const lampTitle = !needsVpn
                ? ''
                : !stepActive
                  ? status === 'done' ? '该步骤已完成（VPN 信号不再相关）' : '该步骤建议开启 VPN（尚未轮到）'
                  : vpnLevel === 'green'
                    ? 'VPN 已开启'
                    : vpnLevel === 'red'
                      ? '需要 VPN 但未开启'
                      : vpnLevel === 'amber'
                        ? 'VPN 已开（建议按需关闭）'
                        : 'VPN 状态无法探测';
              const absIdx = i + 12;
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
                      {needsVpn && (
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
          <div className="space-y-4">{panels}</div>

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
