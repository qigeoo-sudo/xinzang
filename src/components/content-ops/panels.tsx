'use client';

/**
 * 单导师详情页的阶段操作面板（P1 = S0-S7，§6.4 / §8 / §9）。
 * 面板 A：Claude 人工操作与归档登记卡（S4 出现）
 * 面板 B：Codex 结构化指令区（S6 出现；Runner 投递置灰「验证中」，Q15）
 * 面板 C：Trae 合同区（S20 前锁定只读）
 * 另含 S1/S2 文件登记卡、S3 自动探测说明、S7 核验卡。
 * 所有按钮均为元数据/指令动作，不产出任何内容。
 */
import { useEffect, useState } from 'react';
import type { RunDetail, RunStep, RunArtifact } from './types';
import { COMMAND_STATUS_LABELS, STEP_STATUS_LABELS, ARTIFACT_KIND_LABELS, labelOf } from './display-labels';
import { G1_ROUND1_DOCS_TEXT, ROUND1_QC_ITEMS } from '@/lib/content-ops/state-machine';

type ActionFn = (subPath: string, body: Record<string, unknown>) => Promise<void>;

function shortHash(s: string): string {
  return s.length > 16 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

function ImpactNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] leading-4 text-stone-400">影响范围：{children}</p>;
}

function ArtifactRow({ a }: { a: RunArtifact }) {
  return (
    <li className="rounded-lg border border-stone-200 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-stone-700" title={a.displayPath}>
          {a.displayPath}
        </span>
        <span className="shrink-0 text-stone-400">{Number(a.bytes).toLocaleString()} B</span>
      </div>
      <p className="mt-0.5 truncate text-stone-400" title={a.sha256}>
        {labelOf(ARTIFACT_KIND_LABELS, a.kind)} · sha256:{shortHash(a.sha256)}
      </p>
    </li>
  );
}

function StepCommandLine({ step, onRetry, canWrite }: { step: RunStep; onRetry: () => void; canWrite: boolean }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-stone-500">
      <span>
        指令状态：{labelOf(COMMAND_STATUS_LABELS, step.commandStatus)}
        {step.failureReason && <span className="ml-2 text-red-600">{step.failureReason}</span>}
      </span>
      {step.commandStatus === 'failed' && canWrite && (
        <button type="button" onClick={onRetry} className="rounded-md border border-stone-300 px-2 py-0.5">
          重试该指令
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// S1/S2/S5 通用文件登记卡
// ------------------------------------------------------------------

const STEP_FILE_KINDS: Record<string, Array<{ value: string; label: string }>> = {
  S1: [
    { value: 'source_audio', label: '第一轮原始音频' },
    { value: 'source_transcript', label: '第一轮文字稿' },
  ],
  S2: [
    { value: 'merged_audio', label: '归并后音频' },
    { value: 'normalized_md', label: '规范化命名文字稿' },
  ],
  S5: [{ value: 'claude_output', label: 'Claude 产物（by sonnet）' }],
};

const STEP_KIND_LABEL: Record<string, string> = {
  S1: '第一轮材料登记（S1）',
  S2: '归档文件登记（S2）',
  S5: 'Claude 产物登记（S5）',
};

type ScanCandidate = { relPath: string; bytes: number; mtimeMs: number; suggestedKind: string | null; renamed?: boolean };

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function FileRegisterCard({
  run,
  code,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  code: 'S1' | 'S2' | 'S5';
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === code)!;
  const kinds = STEP_FILE_KINDS[code];
  const isS1 = code === 'S1';
  const isS2 = code === 'S2';
  const isS5 = code === 'S5';
  const canScan = isS1 || isS2 || isS5;
  // 多行清单：每行一个相对路径 + 文件类型，一次提交全部（本步哈希全部成功才推进；
  // 因此 P1 要求一次列全本步全部文件，避免步骤关闭后漏登）
  const [rows, setRows] = useState<Array<{ relPath: string; kind: string }>>([
    { relPath: '', kind: kinds[0].value },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const acceptKinds = kinds.map((k) => k.value);
  const artifacts = run.artifacts.filter((a) => acceptKinds.includes(a.kind));
  const registeredPaths = new Set(artifacts.map((a) => a.displayPath));

  // S1/S2 扫描候选：Runner 列目录 → evidence.scanFiles；用户勾选/改类型后批量哈希登记
  const scanEv = (step.evidence ?? {}) as { scanFiles?: ScanCandidate[]; scannedAt?: string };
  const scanFiles = canScan ? scanEv.scanFiles ?? [] : [];
  const scanning = step.commandStatus === 'queued' || step.commandStatus === 'dispatched';
  const [pick, setPick] = useState<Record<string, { checked: boolean; kind: string }>>({});
  useEffect(() => {
    // 仅在新一轮扫描结果到达时重置勾选；已登记文件默认不勾
    setPick(
      Object.fromEntries(
        scanFiles.map((f) => [
          f.relPath,
          { checked: !registeredPaths.has(f.relPath), kind: f.suggestedKind ?? kinds[0].value },
        ]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanEv.scannedAt]);

  const selectable = scanFiles.filter((f) => !registeredPaths.has(f.relPath));
  const allChecked = selectable.length > 0 && selectable.every((f) => pick[f.relPath]?.checked);
  const checkedCount = selectable.filter((f) => pick[f.relPath]?.checked).length;
  const mentorPrefix = `mentors/${run.mentorDir}/`;

  const setRow = (i: number, patch: Partial<{ relPath: string; kind: string }>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submitManual = async () => {
    const files = rows
      .map((r) => ({ relPath: r.relPath.trim(), kind: r.kind }))
      .filter((r) => r.relPath.length > 0);
    if (files.length === 0) {
      setError('至少填一个相对路径（相对 CONTENT_ROOT，例如 mentors/ying wang pilot/…）');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onAction('observe-files', { step: code, files });
      setRows([{ relPath: '', kind: kinds[0].value }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    } finally {
      setBusy(false);
    }
  };

  const startScan = async () => {
    setError('');
    setBusy(true);
    try {
      await onAction(isS1 ? 'scan-files' : isS2 ? 'scan-work-files' : 'scan-claude-outputs', {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '扫描发起失败');
    } finally {
      setBusy(false);
    }
  };

  const submitChecked = async () => {
    const files = selectable
      .filter((f) => pick[f.relPath]?.checked)
      .map((f) => ({ relPath: f.relPath, kind: pick[f.relPath]?.kind ?? f.suggestedKind ?? kinds[0].value }));
    if (files.length === 0) {
      setError('请至少勾选一个未登记的文件');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onAction('observe-files', { step: code, files });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleAll = () => {
    const next = !allChecked;
    setPick((p) => {
      const q = { ...p };
      for (const f of selectable) q[f.relPath] = { checked: next, kind: q[f.relPath]?.kind ?? f.suggestedKind ?? kinds[0].value };
      return q;
    });
  };

  const manualRowsBlock = (
    <>
      <p className="text-[11px] leading-4 text-stone-500">
        {isS5
          ? 'Claude 产物只有一个，填它保存到导师目录后的相对路径。Runner 在哈希时自动套用 ` by sonnet ` 规范命名（文件名已含则跳过），只改名不改内容，然后计算 SHA-256 登记。'
          : '每行一个文件，类型逐行选择；请一次列全本步全部文件——清单整体入队由 Runner 逐个计算哈希，全部成功本步才推进（任意一个路径错误整步失败，可改后重试，不会重复登记）。'}
      </p>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {!isS5 && (
            <select
              value={row.kind}
              onChange={(e) => setRow(i, { kind: e.target.value })}
              className="w-32 shrink-0 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
          <input
            value={row.relPath}
            onChange={(e) => setRow(i, { relPath: e.target.value })}
            placeholder={
              isS5
                ? `mentors/${run.mentorDir}/…（产物原始文件名即可）`
                : 'mentors/ying wang pilot/…（相对 CONTENT_ROOT）'
            }
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
          />
          {!isS5 && rows.length > 1 && (
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
              className="shrink-0 text-stone-400 hover:text-red-500"
              aria-label="删除该行"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {!isS5 && (
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { relPath: '', kind: kinds[0].value }])}
          className="text-xs text-accent underline underline-offset-2"
        >
          + 再加一行
        </button>
      )}
      <button type="button" onClick={submitManual} disabled={busy || !run.runner?.online} className="btn-primary text-sm">
        {busy ? '已入队…' : isS5 ? '提交并由 Runner 规范命名+计算哈希' : '提交清单并由 Runner 计算哈希'}
      </button>
      {!run.runner?.online && <span className="ml-2 text-xs text-red-500">Runner 离线</span>}
    </>
  );

  return (
    <section className="letter-paper rounded-[18px] p-4">
      <h3 className="text-sm font-bold text-stone-700">{STEP_KIND_LABEL[code]}</h3>
      <p className="mt-0.5 text-xs text-stone-400">
        步骤状态：{labelOf(STEP_STATUS_LABELS, step.status)}
        {step.startedAt ? ` · 开始 ${new Date(step.startedAt).toLocaleString('zh-CN')}` : ''}
      </p>

      {canWrite ? (
        <div className="mt-3 space-y-2">
          {canScan && (
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-stone-600">机器扫描候选文件</p>
                <button
                  type="button"
                  onClick={startScan}
                  disabled={busy || scanning || !run.runner?.online}
                  className="rounded-lg border border-cyan-700/30 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {scanning ? '扫描指令执行中…' : scanFiles.length > 0 ? '重新扫描' : isS1 ? '扫描导师目录' : isS2 ? '扫描归并产物' : '扫描产物'}
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-stone-500">
                {isS1
                  ? 'Runner 递归扫描该导师目录（自动跳过 work/outputs 等产物区），只回传文件路径、大小、修改时间，并按扩展名预猜音频/文字稿类型；你勾选或改类型后再让 Runner 计算哈希登记。'
                  : isS2
                    ? 'Runner 扫描该导师目录下文件名含「full」的归并产物（完整音频/完整文字稿），回传路径、大小、修改时间并预猜类型；你确认勾选后让 Runner 计算哈希登记。'
                    : 'Runner 扫描导师根目录下的文档文件，自动套用 ` by sonnet ` 规范命名后把规范命名的文件显示给你（只改名不改内容）；你勾选确认后 Runner 直接计算哈希登记。'}
              </p>
              {!run.runner?.online && <p className="mt-1 text-xs text-red-500">Runner 离线，无法扫描</p>}
              {scanEv.scannedAt && (
                <p className="mt-1 text-[11px] text-stone-400">上次扫描：{new Date(scanEv.scannedAt).toLocaleString('zh-CN')}</p>
              )}
              {scanFiles.length > 0 && (
                <div className="mt-2">
                  {selectable.length > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2 py-1.5">
                      <label className="flex items-center gap-2 text-xs text-stone-600">
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                        全选未登记（{selectable.length} 个可选{registeredPaths.size > 0 ? `，${registeredPaths.size} 个已登记` : ''}）
                      </label>
                      <button
                        type="button"
                        onClick={submitChecked}
                        disabled={busy || scanning || checkedCount === 0}
                        className="btn-primary px-3 py-1 text-xs"
                      >
                        {busy ? '已入队…' : isS5 ? `提交并计算哈希（${checkedCount} 个）` : `确认勾选并登记哈希（${checkedCount} 个）`}
                      </button>
                    </div>
                  )}
                  <ul className="mt-1 max-h-72 space-y-0.5 overflow-auto pr-1">
                    {scanFiles.map((f) => {
                      const registered = registeredPaths.has(f.relPath);
                      const item = pick[f.relPath];
                      if (registered) {
                        // 已登记文件只读展示：文件名+完整路径+大小，不再出现勾选框
                        return (
                          <li key={f.relPath} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                            <span className="w-16 shrink-0 text-right text-stone-400">{formatBytes(f.bytes)}</span>
                            <span className="min-w-0 flex-1 truncate text-stone-500" title={f.relPath}>
                              {f.relPath}
                            </span>
                            <span className="shrink-0 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500">已登记</span>
                          </li>
                        );
                      }
                      return (
                        <li key={f.relPath} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-white">
                          <input
                            type="checkbox"
                            checked={item?.checked ?? false}
                            onChange={(e) =>
                              setPick((p) => ({
                                ...p,
                                [f.relPath]: {
                                  checked: e.target.checked,
                                  kind: p[f.relPath]?.kind ?? f.suggestedKind ?? kinds[0].value,
                                },
                              }))
                            }
                          />
                          {!isS5 && (
                            <select
                              value={item?.kind ?? f.suggestedKind ?? kinds[0].value}
                              onChange={(e) =>
                                setPick((p) => ({
                                  ...p,
                                  [f.relPath]: { checked: p[f.relPath]?.checked ?? true, kind: e.target.value },
                                }))
                              }
                              className="w-28 shrink-0 rounded border border-stone-300 px-1 py-0.5 text-[11px]"
                            >
                              {kinds.map((k) => (
                                <option key={k.value} value={k.value}>
                                  {k.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <span className="w-16 shrink-0 text-right text-stone-400">{formatBytes(f.bytes)}</span>
                          <span className="min-w-0 flex-1 truncate text-stone-700" title={f.relPath}>
                            {f.relPath.startsWith(mentorPrefix) ? f.relPath.slice(mentorPrefix.length) : f.relPath}
                          </span>
                          {isS5 && f.renamed && (
                            <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">已规范命名</span>
                          )}
                          <span className="shrink-0 text-[10px] text-stone-300">
                            {f.mtimeMs ? new Date(f.mtimeMs).toLocaleDateString('zh-CN') : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {scanEv.scannedAt && scanFiles.length === 0 && !scanning && (
                <p className="mt-2 text-xs text-amber-700">
                  {isS1
                    ? '未扫描到候选文件（仅识别音频与 md/txt/doc 文稿，产物区已跳过）。可用下方手工入口。'
                    : isS2
                      ? '未找到文件名含「full」的归并产物。请先把归并后的完整音频/完整文字稿放回对应文件夹（文件名带 full 字样），再重新扫描，或用下方手工入口。'
                      : '导师根目录未发现文档产物（md/txt/docx/doc）。请确认 Claude 产物文件已保存到导师根目录后重新扫描，或用下方手工入口。'}
                </p>
              )}
              <ImpactNote>
                扫描只读元数据，不移动、不读取文件正文；勾选提交后 Runner 才对文件计算字节数与 SHA-256 并登记。
              </ImpactNote>
            </div>
          )}

          {canScan ? (
            <details className="group">
              <summary className="cursor-pointer text-xs text-stone-500 underline underline-offset-2">
                手工填写路径（扫描不到时备用）
              </summary>
              <div className="mt-2 space-y-2">{manualRowsBlock}</div>
            </details>
          ) : (
            manualRowsBlock
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!canScan && (
            <ImpactNote>
              仅让 Runner 对列出的本地文件计算字节数与 SHA-256 并登记元数据；不移动、不修改任何文件内容。
            </ImpactNote>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-stone-400">只读账号：仅可查看登记结果。</p>
      )}

      <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: code })} />

      {artifacts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {artifacts.map((a) => (
            <ArtifactRow key={a.id} a={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// S3：VPN 闸门说明（纯自动，随心跳评估，无按钮）
// ------------------------------------------------------------------

export function S3GateCard({ run }: { run: RunDetail }) {
  const s3 = run.steps.find((s) => s.code === 'S3')!;
  return (
    <section className="letter-paper rounded-[18px] p-4">
      <h3 className="text-sm font-bold text-stone-700">VPN / 连通性探测（S3）</h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        本步由 Runner 心跳自动判定（归档完成后的下一次心跳，≤30 秒）：Claude 端点与国内参照点同时可达才通过，
        通过后进入 Claude 人工提交；不通则停在 vpn_check_failed，状态恢复后心跳自动放行。正式探测结果已写入步骤证据留档。
      </p>
      <p className="mt-2 text-xs text-stone-500">
        步骤状态：{labelOf(STEP_STATUS_LABELS, s3.status)}
        {s3.failureReason && <span className="ml-2 text-red-600">{s3.failureReason}</span>}
      </p>
    </section>
  );
}

// ------------------------------------------------------------------
// 面板 A：Claude 人工操作与归档登记卡（S4/S5）
// ------------------------------------------------------------------

export function ClaudePanelA({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const s4 = run.steps.find((s) => s.code === 'S4')!;
  const s5 = run.steps.find((s) => s.code === 'S5')!;
  const ev = (s4.evidence ?? {}) as { conversationName?: string; note?: string };
  const [conversationName, setConversationName] = useState(ev.conversationName ?? '导师风格摹写');
  // 默认触发语：导师名取 Run 目录名去掉 pilot 后缀（如 "ying wang pilot" → "ying wang"）
  const mentorLabel = run.mentorDir.replace(/\s*pilot$/i, '').trim() || run.mentorDir;
  const defaultTrigger = `帮我完成 ${mentorLabel} 导师的性格侧描。`;
  const [note, setNote] = useState(ev.note ?? defaultTrigger);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [r3, setR3] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyTrigger = async () => {
    try {
      await navigator.clipboard.writeText(note || defaultTrigger);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('剪贴板不可用，请手动选中文字复制');
    }
  };

  const act = async (phase: 'started' | 'completed') => {
    setError('');
    setBusy(true);
    try {
      await onAction('manual-note', {
        phase,
        conversationName: conversationName || undefined,
        note: note || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    } finally {
      setBusy(false);
    }
  };

  const s4Open = s4.status !== 'done';

  return (
    <section className="rounded-[18px] border-2 border-violet-200 bg-violet-50/40 p-4">
      <h3 className="text-sm font-bold text-violet-900">面板 A · Claude 人工操作与归档登记</h3>
      <p className="mt-0.5 text-[11px] text-violet-700/70">
        Claude 永久 manual_only：工作台不驱动 Claude、不代答，只登记人工动作的元数据。
      </p>

      {/* S4 区 */}
      <div className="mt-3">
        <p className="text-xs font-semibold text-stone-600">
          S4 · 导师风格摹写对话（Sonnet 5.5 中等） · {labelOf(STEP_STATUS_LABELS, s4.status)}
        </p>
        {canWrite && s4Open ? (
          <div className="mt-2 space-y-2">
            <input
              value={conversationName}
              onChange={(e) => setConversationName(e.target.value)}
              placeholder="摹写对话名（与 Claude 桌面端中一致）"
              className="input-field text-sm"
            />
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-stone-500">给 Claude 的触发语（可修改，登记后仅留元数据）</label>
                <button
                  type="button"
                  onClick={copyTrigger}
                  className="rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs text-violet-800"
                >
                  {copied ? '已复制 ✓' : '复制去 Claude 粘贴'}
                </button>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="帮我完成某某导师的性格侧描。"
                className="input-field mt-1 text-xs"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={busy || !conversationName.trim()} onClick={() => act('started')} className="btn-primary text-sm">
                登记开始时间
              </button>
              <button type="button" disabled={busy || s4.status !== 'running'} onClick={() => act('completed')} className="rounded-lg border border-stone-300 px-3 text-sm">
                登记 Claude 已完成
              </button>
            </div>
            <ImpactNote>只登记开始/完成时间与对话名；不标记内容合格，产物以归档哈希为准。</ImpactNote>
          </div>
        ) : (
          <p className="mt-1 text-xs text-stone-500">
            对话：{ev.conversationName ?? '—'} · {s4.status === 'done' ? '已完成登记（只读）' : '当前账号只读'}
          </p>
        )}
      </div>

      {/* S5 区：S4 running/done 后出现 */}
      {(s4.status === 'running' || s4.status === 'done' || s5.status !== 'pending') && (
        <div className="mt-4 border-t border-violet-200 pt-3">
          <FileRegisterCard run={run} code="S5" onAction={onAction} canWrite={canWrite} />
          {s5.status === 'waiting_human' && canWrite && (
            <div className="mt-3 space-y-2 rounded-lg bg-white/70 p-3">
              <label className="flex items-start gap-2 text-xs leading-5 text-stone-700">
                <input type="checkbox" checked={r3} onChange={(e) => setR3(e.target.checked)} className="mt-0.5" />
                <span>
                  R3 勾选：该产物由 Claude 在导师风格摹写对话中生成，Trae 未代笔、未改写正文。
                  不勾选则不能进入归档完成态，Codex 步骤不会获得合法输入。
                </span>
              </label>
              <button
                type="button"
                disabled={!r3 || busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await onAction('confirm-archive', { r3Checked: true });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '归档确认失败');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="btn-primary text-sm"
              >
                确认归档 Claude 产物
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// 面板 B：Codex 结构化指令区（S6）
// ------------------------------------------------------------------

export function CodexPanelB({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const s6 = run.steps.find((s) => s.code === 'S6')!;
  const contract = (run.taskContract ?? {}) as { r1Trigger?: string };
  const trigger = contract.r1Trigger ?? '（触发语未生成）';
  const ev = (s6.evidence ?? {}) as { conversationName?: string; codex?: { detected?: boolean; version?: string } };
  const [conversationName, setConversationName] = useState(ev.conversationName ?? '');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trigger);
    } catch {
      /* 剪贴板不可用时仍登记 */
    }
    setBusy(true);
    try {
      await onAction('codex-submission', { action: 'copied' });
      setCopied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    } finally {
      setBusy(false);
    }
  };

  const codexProbe = ev.codex as { installed?: boolean; version?: string; source?: string } | undefined;

  return (
    <section className="rounded-[18px] border-2 border-sky-200 bg-sky-50/40 p-4">
      <h3 className="text-sm font-bold text-sky-900">面板 B · Codex 结构化指令区</h3>
      <p className="mt-0.5 text-[11px] text-sky-700/70">
        没有自由聊天框：只有该步固定触发语 + 事实补充在 Codex 对话内人工完成；全程使用该导师专属对话，不新建。
      </p>

      <div className="mt-3 rounded-lg bg-white/80 p-3">
        <p className="text-xs font-semibold text-stone-600">S6 固定触发语</p>
        <p className="mt-1 select-all rounded bg-stone-50 p-2 text-xs leading-5 text-stone-700">{trigger}</p>
        {codexProbe && (
          <p className="mt-1 text-[11px] text-stone-400">
            本机 Codex CLI：
            {codexProbe.installed
              ? `已检测到 ${codexProbe.version ?? ''}${
                  codexProbe.source === 'desktop_native'
                    ? '（桌面原生版）'
                    : codexProbe.source === 'npm_shim'
                      ? '（npm 全局版，建议换桌面原生版）'
                      : ''
                }`
              : '未检测到'}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {canWrite ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={copy} disabled={busy} className="btn-primary text-sm">
              {copied ? '已复制并登记 ✓' : '复制触发语（人工粘贴）'}
            </button>
            <button type="button" disabled title="能力验证中（Q15），P1 期间不可点" className="cursor-not-allowed rounded-lg border border-stone-300 bg-stone-100 px-3 py-1.5 text-sm text-stone-400">
              由 Runner 投递（验证中）
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-stone-400">只读账号。</p>
        )}
        <ImpactNote>复制只把固定文本放入剪贴板并登记复制时间；不会向任何对话发送内容。</ImpactNote>
      </div>

      {canWrite && (
        <div className="mt-3 space-y-2">
          <input
            value={conversationName}
            onChange={(e) => setConversationName(e.target.value)}
            placeholder="该导师专属 Codex 对话名（全程复用）"
            className="input-field text-sm"
          />
          <button
            type="button"
            disabled={busy || !conversationName.trim() || s6.status === 'done'}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onAction('codex-submission', { action: 'started', conversationName });
              } catch (e) {
                setError(e instanceof Error ? e.message : '登记失败');
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg border border-sky-400 px-3 py-1.5 text-sm text-sky-800"
          >
            我确认已在专属对话提交，Codex 已开始
          </button>
          <p className="text-xs text-stone-500">
            步骤状态：{labelOf(STEP_STATUS_LABELS, s6.status)} · {labelOf(COMMAND_STATUS_LABELS, s6.commandStatus)}
          </p>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// S7：Assembly 完成核验卡
// ------------------------------------------------------------------

export function VerifyAssemblyCard({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const s7 = run.steps.find((s) => s.code === 'S7')!;
  const ev = (s7.evidence ?? {}) as { chosenPackage?: string; packages?: Array<{ name: string; hasStartHere: boolean }> };
  const startHere = run.artifacts.find((a) => a.kind === 'codex_work_package');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <section className="letter-paper rounded-[18px] p-4">
      <h3 className="text-sm font-bold text-stone-700">S7 · Assembly 完成核验</h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        Runner 扫描该导师 work 目录下含 00_START_HERE.md 的版本包；P1 取名称排序最后一个（选择依据留档，可回退人工），
        再对 00_START_HERE.md 计算 SHA-256。两者成功才视为 Assembly 核验通过。
      </p>
      {ev.chosenPackage && (
        <p className="mt-2 text-xs text-stone-600">
          选中版本包：<span className="font-medium">{ev.chosenPackage}</span>
        </p>
      )}
      {startHere && <div className="mt-2"><ArtifactRow a={startHere} /></div>}
      {s7.failureReason && <p className="mt-2 text-xs text-red-600">{s7.failureReason}</p>}
      {canWrite ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onAction('verify-assembly', {});
              } catch (e) {
                setError(e instanceof Error ? e.message : '核验发起失败');
              } finally {
                setBusy(false);
              }
            }}
            className="btn-primary text-sm"
          >
            {s7.commandStatus === 'queued' || s7.commandStatus === 'dispatched' ? '核验指令已下发…' : '执行 Assembly 完成核验'}
          </button>
          {s7.commandStatus === 'failed' && (
            <button type="button" onClick={() => onAction('retry-command', { stepCode: 'S7' })} className="rounded-md border border-stone-300 px-2 py-1 text-sm">
              重新验证
            </button>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      ) : (
        <p className="mt-2 text-xs text-stone-400">只读账号。</p>
      )}
      <StepCommandLine step={s7} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S7' })} />
    </section>
  );
}

// ------------------------------------------------------------------
// 面板 C：Trae 合同区（S20 第一次门禁前锁定只读，P1 永远锁定）
// ------------------------------------------------------------------

export function TraePanelC() {
  return (
    <section className="rounded-[18px] border-2 border-stone-200 bg-stone-50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-stone-600">
        🔒 面板 C · Trae 集成合同区
      </h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        第一次门禁（S20「确认交给Trae集成至main和测试端」）通过前本区锁定：没有任何自由指令输入口，
        不接受「帮我改 Prompt / 知识卡」类请求。门禁后此处只读展示 TRAE_HANDOFF.md 集成合同摘要、
        八类测试结果、修改文件清单、Git SHA 与回滚点。P1 边界为 S0-S7，本区在本阶段全程锁定。
      </p>
    </section>
  );
}

// ------------------------------------------------------------------
// S8：第一轮阅览文件定位 + AI 四维比对 + 人工裁决（P2a，方案 C）
// ------------------------------------------------------------------

type LocatedDoc = {
  relPath: string;
  absPath: string | null;
  docType: string;
  version: string | null;
  bytes: number;
  sha256: string | null;
  refMentor?: string | null;
};

type CompareFinding = { severity: 'block' | 'warn' | 'info'; chapter: string; detail: string };

type CompareResult = {
  docType: string;
  relPath: string;
  scores: Record<string, number>;
  reasons: Partial<Record<string, string>>;
  findings: CompareFinding[];
  summary: string;
  model: string;
};

type StepEvidence = {
  locate?: { docs: LocatedDoc[]; refs: LocatedDoc[]; missing?: string[]; ambiguous?: boolean; locatedAt: string };
  compare?: { results: CompareResult[]; aiPass: boolean; at: string };
  qc?: { decision: 'pass' | 'reject'; aiPass?: boolean; overridden?: boolean; note?: string | null; decidedAt: string };
};

function scoreColor(v: number): string {
  if (v >= 80) return 'text-emerald-700';
  if (v >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function barColor(v: number): string {
  if (v >= 80) return 'bg-emerald-500';
  if (v >= 60) return 'bg-amber-400';
  return 'bg-red-500';
}

function CompareResultCard({ r }: { r: CompareResult }) {
  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <p className="truncate text-xs font-semibold text-stone-700" title={r.relPath}>
        {r.relPath.split('/').pop()}
      </p>
      <div className="mt-2 space-y-1.5">
        {ROUND1_QC_ITEMS.map((dim) => {
          const v = r.scores[dim.key] ?? 0;
          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-600">
                  {dim.label}
                  <span className="ml-1 text-stone-400">{dim.desc}</span>
                </span>
                <span className={`font-semibold ${scoreColor(v)}`}>{v}%</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div className={`h-full ${barColor(v)}`} style={{ width: `${Math.max(2, v)}%` }} />
              </div>
              {v < 80 && r.reasons[dim.key] && (
                <p className="mt-0.5 rounded bg-red-50 px-2 py-1 text-[11px] leading-4 text-red-700">
                  低于 80%：{r.reasons[dim.key]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {r.findings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.findings.map((f, i) => (
            <li
              key={i}
              className={`rounded px-2 py-1 text-[11px] leading-4 ${
                f.severity === 'block'
                  ? 'bg-red-50 text-red-700'
                  : f.severity === 'warn'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-stone-50 text-stone-500'
              }`}
            >
              <span className="font-semibold">
                {f.severity === 'block' ? '必改' : f.severity === 'warn' ? '建议' : '提示'}
                {f.chapter ? ` · ${f.chapter}` : ''}：
              </span>
              {f.detail}
            </li>
          ))}
        </ul>
      )}
      {r.summary && <p className="mt-2 text-[11px] leading-4 text-stone-500">AI 总评：{r.summary}</p>}
    </div>
  );
}

export function Round1DocsQcPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S8');
  const evidence = (step?.evidence ?? {}) as StepEvidence;
  const locate = evidence.locate;
  const compare = evidence.compare;
  const qc = evidence.qc;
  const locateRunning =
    !locate && (step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched');
  const compareRunning =
    !!locate && !compare && (step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const act = async (subPath: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await onAction(subPath, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const registered = new Set(run.artifacts.filter((a) => a.kind === 'review_doc').map((a) => a.displayPath));

  // 需要显示面板的时机：状态进入比对中/比对失败/等待批准前，或 S8 行存在
  if (!run.status.includes('round1_docs_qc') && !step) return null;

  const locateReady = !!locate && !locate.ambiguous && (locate.missing?.length ?? 0) === 0;
  const aiFailed = !!compare === false && step?.status === 'failed' && !!locate;

  return (
    <section className="letter-paper rounded-[18px] p-4">
      <h3 className="text-sm font-bold text-stone-700">S8 · 第一轮阅览文件定位 + AI 四维比对</h3>
      <p className="mt-0.5 text-xs text-stone-400">
        步骤状态：{labelOf(STEP_STATUS_LABELS, step?.status)}
        {step?.failureReason && <span className="ml-2 text-red-600">{step.failureReason}</span>}
      </p>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        Runner 按命名约定定位两份阅览文件，读取本导师与 kevin yuan / phyllis chi / ying wang 共 8 份文件正文（正文只用于本次评分、不落库），
        由系统按结构、职责、密度、可读性四维各打百分比；任一维低于 80% 给出章节级原因。AI 只提供证据，放行或驳回由你决定。
      </p>

      {!step && canWrite && (
        <div className="mt-3">
          <button type="button" onClick={() => act('start-round1-docs-qc', {})} disabled={busy || !run.runner?.online} className="btn-primary text-sm">
            {busy ? '已入队…' : '开始定位阅览文件'}
          </button>
          {!run.runner?.online && <span className="ml-2 text-xs text-red-500">Runner 离线</span>}
          {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
        </div>
      )}

      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S8' })} />}

      {locateRunning && <p className="mt-3 text-xs text-stone-500">正在定位 work 目录并计算哈希…</p>}

      {locate && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <p className="text-xs font-semibold text-stone-600">
              定位到的阅览文件（{locate.locatedAt ? new Date(locate.locatedAt).toLocaleString('zh-CN') : ''}）
            </p>
            <ul className="mt-1 space-y-0.5">
              {locate.docs.map((d) => (
                <li key={d.relPath} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                  <span className="w-16 shrink-0 text-right text-stone-400">{formatBytes(d.bytes)}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-600" title={d.relPath}>
                    {d.relPath}
                  </span>
                  <span className="shrink-0 text-stone-400">{d.version ?? '—'}</span>
                  <span className="shrink-0 truncate text-stone-400" title={d.sha256 ?? ''}>
                    sha256:{d.sha256 ? shortHash(d.sha256) : '—'}
                  </span>
                  {registered.has(d.relPath) && (
                    <span className="shrink-0 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500">已登记</span>
                  )}
                </li>
              ))}
            </ul>
            {(locate.missing?.length ?? 0) > 0 && (
              <p className="mt-1 text-xs text-red-600">未找到：{locate.missing!.join('、')}（命名约定：&lt;Display_Name&gt;_语言人格风格分析/第一轮审核清单_v&lt;版本&gt;.md）</p>
            )}
            {locate.ambiguous && <p className="mt-1 text-xs text-red-600">候选文件歧义（同版本多于一份），请人工确认后重新发起。</p>}
          </div>

          {locate.refs.length > 0 && (
            <details className="rounded-xl border border-stone-200 px-3 py-2">
              <summary className="cursor-pointer text-xs text-stone-500">
                同类参考文档（{locate.refs.length} 份，每类每人取最新版：kevin yuan v0.1 / phyllis chi v0.2-v0.3 / ying wang v0.1）
              </summary>
              <ul className="mt-1 space-y-0.5">
                {locate.refs.map((d) => (
                  <li key={`${d.refMentor}/${d.relPath}`} className="flex items-center gap-2 px-2 py-0.5 text-xs text-stone-500">
                    <span className="w-20 shrink-0">{d.refMentor}</span>
                    <span className="min-w-0 flex-1 truncate" title={d.relPath}>
                      {d.relPath}
                    </span>
                    <span className="shrink-0 text-stone-400">
                      {d.docType === 'review_checklist' ? '审核清单' : '风格分析'} {d.version ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {compareRunning && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 text-xs text-cyan-900">
              AI 比对进行中：Runner 正在读取 {2 + locate.refs.length} 份文件正文，随后系统并行调用评分，通常 30-60 秒，本页会自动刷新。
            </div>
          )}

          {compare && (
            <div className="space-y-3">
              <div
                className={`rounded-xl border p-3 text-xs ${
                  compare.aiPass ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-amber-200 bg-amber-50/60 text-amber-900'
                }`}
              >
                {compare.aiPass
                  ? `AI 评定 8 个维度全部 ≥80%，建议放行（${new Date(compare.at).toLocaleString('zh-CN')}）。你仍需通读两份文件后做最终裁决。`
                  : `AI 评定存在低于 80% 的维度（${new Date(compare.at).toLocaleString('zh-CN')}）。若确认问题，驳回并把原因带到 Codex 对话修订；若你判断 AI 误判，可填依据后人工放行。`}
              </div>
              {compare.results.map((r) => (
                <CompareResultCard key={r.relPath} r={r} />
              ))}
            </div>
          )}

          {qc && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                qc.decision === 'pass' ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-red-200 bg-red-50/60 text-red-700'
              }`}
            >
              已裁决：{qc.decision === 'pass' ? `放行进入 S9${qc.overridden ? '（人工 override AI 结论）' : ''}` : '驳回，交回 Codex 修订'}
              {qc.note ? ` —— ${qc.note}` : ''}
              <span className="ml-2 text-stone-400">{new Date(qc.decidedAt).toLocaleString('zh-CN')}</span>
            </div>
          )}

          {canWrite && locateReady && !compareRunning && !qc && ['round1_docs_qc', 'round1_docs_qc_failed'].includes(run.status) && (
            <div className="rounded-xl border border-stone-200 p-3">
              {!compare ? (
                <div className="flex items-center gap-2">
                  {locate.refs.length !== 6 ? (
                    <>
                      <span className="text-xs text-amber-700">
                        参考集已更新（当前定位到 {locate.refs.length} 份，应为 6 份定型参考），需重新定位。
                      </span>
                      <button type="button" onClick={() => act('start-round1-docs-qc', {})} disabled={busy || !run.runner?.online} className="btn-primary text-sm">
                        {busy ? '已入队…' : '重新定位'}
                      </button>
                    </>
                  ) : (
                    <>
                      {aiFailed && <span className="text-xs text-red-600">上次 AI 比对失败，可重试；</span>}
                      <button type="button" onClick={() => act('start-ai-compare', {})} disabled={busy || !run.runner?.online} className="btn-primary text-sm">
                        {busy ? '已入队…' : '发起 AI 四维比对'}
                      </button>
                    </>
                  )}
                  {!run.runner?.online && <span className="text-xs text-red-500">Runner 离线</span>}
                  {error && <span className="text-xs text-red-600">{error}</span>}
                  <ImpactNote>需要控制平面已配置 DeepSeek key；无 key 或网络不通时步骤失败，可在恢复后重试，不会产生任何内容改动。</ImpactNote>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-stone-600">人工裁决（AI 是证据，你是门禁）</p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder={
                      compare.aiPass
                        ? '裁决备注（可选）'
                        : 'AI 有维度低于 80%：放行需填写判断依据（≥10 字）；驳回需填写带给 Codex 的修订原因（≥5 字）'
                    }
                    className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => act('round1-qc', { decision: 'pass', note })}
                      disabled={busy || (!compare.aiPass && note.trim().length < 10)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      {busy ? '提交中…' : '通过，进入 S9 发送批准'}
                    </button>
                    <button
                      type="button"
                      onClick={() => act('round1-qc', { decision: 'reject', note })}
                      disabled={busy || note.trim().length < 5}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
                    >
                      驳回，交回 Codex 修订
                    </button>
                    {error && <span className="text-xs text-red-600">{error}</span>}
                  </div>
                  <ImpactNote>驳回后 Run 进入「比对未过」，在 Codex 导师对话中说明问题要求修订，Trae 不自行改正文；修订后重新走定位与比对。</ImpactNote>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// S9：G1 批准发送第一轮阅览文件（P2a，人工批准 + dedup + 失败回退人工）
// ------------------------------------------------------------------

type SendEvidence = {
  sendPlan?: Array<{ kind: string; label: string }>;
  sendLog?: Array<{ index: number; kind: string; label: string | null; messageId: string | null; at: string }>;
  dedupKeyBase?: string;
  manualSend?: { by: string; at: string; note?: string | null };
};

const G1_CONFIRM_ITEMS: Array<{ key: 'filesRead' | 'qcSeen' | 'chatConfirmed' | 'copyUnchanged'; label: string }> = [
  { key: 'filesRead', label: '两份阅览文件已通读' },
  { key: 'qcSeen', label: 'AI 四维比对评分与裁决结论已看过' },
  { key: 'chatConfirmed', label: '目标群已确认（群名与 Run 绑定群一致）' },
  { key: 'copyUnchanged', label: 'G1 固定文案未改动，按原文发送' },
];

export function Round1SendApprovalPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S9');
  const ev = ((step?.evidence ?? {}) as SendEvidence);
  const reviewDocs = run.artifacts.filter((a) => a.kind === 'review_doc');
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirms, setConfirms] = useState<Record<string, boolean>>({});
  const [manualConfirms, setManualConfirms] = useState<Record<string, boolean>>({});
  const [manualNote, setManualNote] = useState('');

  const showPanel =
    run.status === 'awaiting_send_approval_round1_docs' ||
    run.status === 'round1_docs_sent' ||
    run.status === 'failed' ||
    Boolean(step);
  if (!showPanel) return null;

  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      await onAction('approve-send-round1-docs', { confirm: confirms });
    } catch (e) {
      setError(e instanceof Error ? e.message : '批准失败');
    } finally {
      setBusy(false);
    }
  };

  const markManual = async () => {
    setBusy(true);
    setError('');
    try {
      await onAction('mark-manual-send', { confirm: { filesSent: manualConfirms.filesSent, textSent: manualConfirms.textSent }, note: manualNote });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    } finally {
      setBusy(false);
    }
  };

  const sendFailed = step?.failureReason && step.status === 'failed';

  return (
    <section className="letter-paper rounded-[18px] p-4">
      <h3 className="text-sm font-bold text-stone-700">S9 · 批准发送第一轮阅览文件（G1）</h3>
      <p className="mt-0.5 text-xs text-stone-400">
        步骤状态：{labelOf(STEP_STATUS_LABELS, step?.status)}
        {step?.failureReason && <span className="ml-2 text-red-600">{step.failureReason}</span>}
      </p>

      <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
        <p className="text-xs font-semibold text-stone-600">待发送内容（2 份文件 + 1 条固定文案）</p>
        <ul className="mt-1 space-y-0.5">
          {reviewDocs.map((a) => (
            <ArtifactRow key={a.id} a={a} />
          ))}
          {reviewDocs.length === 0 && (
            <li className="rounded-md px-2 py-1 text-xs text-stone-400">尚未定位登记阅览文件（先完成 S8）。</li>
          )}
        </ul>
        <blockquote className="mt-2 border-l-2 border-stone-300 pl-2 text-xs leading-5 text-stone-600">{G1_ROUND1_DOCS_TEXT}</blockquote>
        <p className="mt-1 text-[11px] text-stone-400">目标群：{run.feishuChatName || run.feishuChatId}（发送方为你的飞书账号）</p>
      </div>

      {run.status === 'awaiting_send_approval_round1_docs' && !running && canWrite && (
        <div className="mt-3 rounded-xl border border-stone-200 p-3">
          <p className="text-xs font-semibold text-stone-600">证据核对勾（全部勾选后按钮才可用）</p>
          <div className="mt-2 space-y-1.5">
            {G1_CONFIRM_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={Boolean(confirms[item.key])}
                  onChange={(e) => setConfirms((c) => ({ ...c, [item.key]: e.target.checked }))}
                />
                {item.label}
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={busy || !G1_CONFIRM_ITEMS.every((i) => confirms[i.key]) || !run.runner?.online}
              className="btn-primary text-sm"
            >
              {busy ? '已入队…' : '批准发送：第一轮阅览文件'}
            </button>
            {!run.runner?.online && <span className="text-xs text-red-500">Runner 离线</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
          <ImpactNote>
            授权范围：仅本次向群「{run.feishuChatName || run.feishuChatId}」发送 2 份文件 + 1 条固定文案；带 dedup 键与逐条幂等键，禁止自动重发。
          </ImpactNote>
        </div>
      )}

      {running && (
        <div className="mt-3">
          <p className="text-xs text-stone-500">发送指令执行中…（每条间隔一次心跳上报）</p>
          <StepCommandLine step={step!} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S9' })} />
        </div>
      )}

      {ev.sendLog && ev.sendLog.length > 0 && (
        <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
          <p className="text-xs font-semibold text-stone-600">飞书发送记录（仅元数据）</p>
          <ul className="mt-1 space-y-0.5">
            {ev.sendLog.map((l) => (
              <li key={l.at + String(l.index)} className="flex items-center gap-2 px-2 py-0.5 text-xs text-stone-500">
                <span className="w-10 shrink-0 text-stone-400">#{l.index + 1}</span>
                <span className="shrink-0 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500">{l.kind === 'text' ? '文案' : '文件'}</span>
                <span className="min-w-0 flex-1 truncate" title={l.label ?? ''}>
                  {l.label ?? '—'}
                </span>
                <span className="shrink-0 truncate text-stone-400">{l.messageId ? `om:${l.messageId.slice(0, 10)}…` : '已发送'}</span>
                <span className="shrink-0 text-stone-400">{new Date(l.at).toLocaleTimeString('zh-CN')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sendFailed && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
          <p className="text-xs text-red-600">Runner 发送失败（禁止自动重发）。可重试同队列指令，或人工在群里发送后登记：</p>
          {canWrite && (
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-stone-600">
                <input type="checkbox" checked={Boolean(manualConfirms.filesSent)} onChange={(e) => setManualConfirms((c) => ({ ...c, filesSent: e.target.checked }))} />
                我已人工在群内发送两份阅览文件
              </label>
              <label className="flex items-center gap-2 text-xs text-stone-600">
                <input type="checkbox" checked={Boolean(manualConfirms.textSent)} onChange={(e) => setManualConfirms((c) => ({ ...c, textSent: e.target.checked }))} />
                我已人工发送 G1 固定文案
              </label>
              <input
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="备注（可选，例如群内消息链接）"
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
              />
              <div className="flex items-center gap-2">
                <button type="button" onClick={markManual} disabled={busy || !manualConfirms.filesSent || !manualConfirms.textSent} className="btn-primary text-sm">
                  标记人工已发送
                </button>
                <button type="button" onClick={() => onAction('retry-command', { stepCode: 'S9' })} className="rounded-md border border-stone-300 px-2 py-1 text-sm">
                  重试发送
                </button>
              </div>
              <ImpactNote>人工登记同样写入 dedup 键，防止后续重复发送。</ImpactNote>
            </div>
          )}
        </div>
      )}

      {ev.manualSend && (
        <p className="mt-2 text-xs text-stone-500">
          已登记人工发送（{new Date(ev.manualSend.at).toLocaleString('zh-CN')}）{ev.manualSend.note ? ` · ${ev.manualSend.note}` : ''}
        </p>
      )}

      {run.status === 'round1_docs_sent' && (
        <p className="mt-2 text-xs text-emerald-700">阅览文件已发送。下一步 S10（审核回复抓取）将在后续阶段开放。</p>
      )}
    </section>
  );
}
