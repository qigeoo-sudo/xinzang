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
import {
  G1_ROUND1_DOCS_TEXT,
  G2_OUTLINE_TEXT,
  G2_OUTLINE_LINK,
  G2_OUTLINE_MESSAGE,
  G3_ROUND2_DOCS_TEXT,
  G5_PRODUCTION_APPROVAL_BUTTON,
  G5_PRODUCTION_APPROVAL_SCOPE,
  S21_PHASES,
  S22_PHASES,
  ROUND1_QC_ITEMS,
  ROUND2_UPDATE_TRIGGER,
  ROUND2_ABSORB_TRIGGER,
} from '@/lib/content-ops/state-machine';

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
  S13: [
    { value: 'merged_audio', label: '归并后音频（full interview）' },
    { value: 'normalized_md', label: '规范化命名文字稿（full transcript）' },
  ],
};

const STEP_KIND_LABEL: Record<string, string> = {
  S1: '第一轮材料登记（S1）',
  S2: '归档文件登记（S2）',
  S5: 'Claude 产物登记（S5）',
  S13: '第二轮归档文件登记（S13）',
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
  code: 'S1' | 'S2' | 'S5' | 'S13';
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === code)!;
  const kinds = STEP_FILE_KINDS[code];
  const isS1 = code === 'S1';
  const isS2 = code === 'S2';
  const isS5 = code === 'S5';
  const isS13 = code === 'S13';
  const canScan = isS1 || isS2 || isS5;
  // S13 与第一轮 S2 同构：只填归并文件名（不带路径），完整路径由类型决定并显示在下方供核对。
  // 目录约定：merged_audio → <dir> audio/<dir> 第二轮 interview audio；normalized_md → <dir> word/<dir> 第二轮 interview word
  const s13Dir = (kind: string) =>
    kind === 'normalized_md'
      ? `mentors/${run.mentorDir}/${run.mentorDir} word/${run.mentorDir} 第二轮 interview word`
      : `mentors/${run.mentorDir}/${run.mentorDir} audio/${run.mentorDir} 第二轮 interview audio`;
  // 多行清单：每行一个相对路径 + 文件类型，一次提交全部（本步哈希全部成功才推进；
  // 因此 P1 要求一次列全本步全部文件，避免步骤关闭后漏登）
  // S13 预填第一轮同款归并文件名（round2 full interview/transcript）；仅在多个源文件归并后才存在，
  // 导师只传单文件时该行删掉即可
  const [rows, setRows] = useState<Array<{ relPath: string; kind: string }>>(() =>
    isS13
      ? [
          { relPath: `${run.mentorDir} round2 full interview.m4a`, kind: 'merged_audio' },
          { relPath: `${run.mentorDir} round2 full transcript.md`, kind: 'normalized_md' },
        ]
      : [{ relPath: '', kind: kinds[0].value }],
  );
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
    // S13 只收集文件名，提交前按类型拼上固定目录
    const files = rows
      .map((r) => ({
        relPath: isS13 && !r.relPath.includes('/') ? `${s13Dir(r.kind)}/${r.relPath.trim()}` : r.relPath.trim(),
        kind: r.kind,
      }))
      .filter((r) => r.relPath.length > 0);
    if (files.length === 0) {
      setError(isS13 ? '至少填一个归并文件名' : '至少填一个相对路径（相对 CONTENT_ROOT，例如 mentors/ying wang pilot/…）');
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
          : isS13
            ? '与第一轮 S2 同构：只填归并文件名（不带路径），目录按类型固定（音频→第二轮 interview audio，文稿→第二轮 interview word），完整路径显示在下方供核对。导师只传单文件、没有归并稿时删掉对应行即可。'
            : '每行一个文件，类型逐行选择；请一次列全本步全部文件——清单整体入队由 Runner 逐个计算哈希，全部成功本步才推进（任意一个路径错误整步失败，可改后重试，不会重复登记）。'}
      </p>
      {rows.map((row, i) => (
        <div key={i}>
          <div className="flex items-center gap-2">
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
                isS13
                  ? `${run.mentorDir} round2 full interview.m4a（只填文件名）`
                  : isS5
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
          {isS13 && row.relPath.trim() && (
            <p className="mt-0.5 break-all pl-1 text-[10px] text-stone-400">
              完整路径：{s13Dir(row.kind)}/{row.relPath.trim()}
            </p>
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

  // S13 归并稿已全部登记时隐藏输入区（与 S2 完成后不再显示输入同构）
  const s13MergedDone = isS13 && artifacts.some((a) => a.kind === 'merged_audio') && artifacts.some((a) => a.kind === 'normalized_md');

  return (
    <section className="letter-paper rounded-[18px] p-4">
      <h3 className="text-sm font-bold text-stone-700">{STEP_KIND_LABEL[code]}</h3>
      <p className="mt-0.5 text-xs text-stone-400">
        步骤状态：{labelOf(STEP_STATUS_LABELS, step.status)}
        {step.startedAt ? ` · 开始 ${new Date(step.startedAt).toLocaleString('zh-CN')}` : ''}
      </p>
      {isS13 && Boolean((step.evidence as Record<string, unknown> | undefined)?.mergeError) && (
        <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {String((step.evidence as Record<string, unknown>).mergeError)}
        </p>
      )}

      {canWrite && !s13MergedDone && step.status !== 'done' ? (
        <div className="mt-3 space-y-2">
          {canScan && (
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-stone-600">机器扫描候选文件</p>
                <button
                  type="button"
                  onClick={startScan}
                  disabled={busy || scanning || !run.runner?.online || step.status === 'done'}
                  className="rounded-lg border border-cyan-700/30 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {scanning ? '扫描指令执行中…' : step.status === 'done' ? '已扫描完成 ✓' : scanFiles.length > 0 ? '重新扫描' : isS1 ? '扫描导师目录' : isS2 ? '扫描归并产物' : '扫描产物'}
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
      ) : canWrite && s13MergedDone ? (
        <p className="mt-2 text-xs text-emerald-600">归并稿已全部登记完成。</p>
      ) : canWrite && step.status === 'done' ? (
        <p className="mt-2 text-xs text-stone-400">已完成登记（只读）。</p>
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
        {s3.failureReason && (
          <span className={`ml-2 ${s3.status === 'done' ? 'text-stone-400' : 'text-red-600'}`}>
            {s3.status === 'done' ? `（历史记录：${s3.failureReason}）` : s3.failureReason}
          </span>
        )}
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
                  disabled={s4.status === 'done'}
                  onClick={copyTrigger}
                  className="rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs text-violet-800 disabled:opacity-40"
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
                disabled={!r3 || busy || (s5.status as string) === 'done'}
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
  const ev = (s6.evidence ?? {}) as {
    conversationName?: string;
    codex?: { detected?: boolean; version?: string };
    codexThreadId?: string;
    codexOutput?: string;
    codexError?: string;
  };
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
  const runnerOnline = Boolean(run.runner?.online);

  const deliver = async () => {
    setBusy(true);
    setError('');
    try {
      await onAction('codex-submission', { action: 'deliver' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '投递失败');
    } finally {
      setBusy(false);
    }
  };

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
            <button type="button" onClick={copy} disabled={busy || s6.status === 'done'} className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {copied || s6.status === 'done' ? '已复制并登记 ✓' : '复制触发语（人工粘贴）'}
            </button>
            <button
              type="button"
              onClick={deliver}
              disabled={busy || s6.status === 'done' || !runnerOnline || !codexProbe?.installed}
              className="rounded-lg border border-sky-400 bg-sky-50 px-3 py-1.5 text-sm text-sky-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!runnerOnline ? 'Runner 离线' : !codexProbe?.installed ? '未检测到 Codex CLI' : '由 Runner 自动投递触发语到 Codex'}
            >
              {busy ? '投递中…' : s6.commandStatus === 'queued' || s6.commandStatus === 'running' ? '已入队，等待 Runner…' : '由 Runner 投递'}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-stone-400">只读账号。</p>
        )}
        {ev.codexError && (
          <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">Runner 投递失败：{ev.codexError}</p>
        )}
        {ev.codexThreadId && (
          <p className="mt-2 text-[11px] text-stone-500">
            Codex 对话 thread_id：<code className="select-all">{ev.codexThreadId}</code>
            {ev.codexOutput && (
              <span className="mt-1 block max-h-32 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-stone-600">{ev.codexOutput}</span>
            )}
          </p>
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
            disabled={busy || s7.status === 'done'}
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
            {s7.status === 'done' ? '已完成核验' : s7.commandStatus === 'queued' || s7.commandStatus === 'dispatched' ? '核验指令已下发…' : '执行 Assembly 完成核验'}
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
// 面板 C：Trae 合同区（S20 第一次门禁前锁定只读；P4a S20 通过后切换为「待 P4b 开放」只读）
// ------------------------------------------------------------------

export function TraePanelC({ run }: { run: RunDetail }) {
  const unlocked = ['reconciling_snapshots', 'integration_backup_created', 'integrating_application', 'testing_staging', 'pushing_main', 'deploying_staging', 'awaiting_staging_acceptance', 'production_approval_granted', 'locking_accepted_main_sha', 'promoting_main_to_master', 'deploying_production', 'verifying_production', 'completed'].includes(run.status);
  return (
    <section className={`rounded-[18px] border-2 p-4 ${unlocked ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-stone-50'}`}>
      <h3 className={`flex items-center gap-2 text-sm font-bold ${unlocked ? 'text-emerald-700' : 'text-stone-600'}`}>
        {unlocked ? '🔓 面板 C · Trae 集成合同区（已解锁）' : '🔒 面板 C · Trae 集成合同区'}
      </h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        {unlocked
          ? 'G4 第一次门禁已通过。S21 Trae 集成（六段自动串联：对账→备份→集成→八类测试→推 main→部署测试端）由 Runner 全自动执行；S22 生产发布需 G5 人工确认后自动串联。集成合同摘要、测试结果、Git SHA 与回滚点在 S21/S22 面板只读展示。'
          : '第一次门禁（S20「确认交给Trae集成至main和测试端」）通过前本区锁定：没有任何自由指令输入口，不接受「帮我改 Prompt / 知识卡」类请求。门禁后此处只读展示 TRAE_HANDOFF.md 集成合同摘要、八类测试结果、修改文件清单、Git SHA 与回滚点。'}
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
                      <button type="button" onClick={() => act('start-round1-docs-qc', {})} disabled={busy || !run.runner?.online || step?.status === 'done'} className="btn-primary text-sm">
                        {busy ? '已入队…' : '重新定位'}
                      </button>
                    </>
                  ) : (
                    <>
                      {aiFailed && <span className="text-xs text-red-600">上次 AI 比对失败，可重试；</span>}
                      <button type="button" onClick={() => act('start-ai-compare', {})} disabled={busy || !run.runner?.online || step?.status === 'done'} className="btn-primary text-sm">
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
                      disabled={busy || (!compare.aiPass && note.trim().length < 10) || step?.status === 'done'}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      {busy ? '提交中…' : '通过，进入 S9 发送批准'}
                    </button>
                    <button
                      type="button"
                      onClick={() => act('round1-qc', { decision: 'reject', note })}
                      disabled={busy || note.trim().length < 5 || step?.status === 'done'}
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
              disabled={busy || !G1_CONFIRM_ITEMS.every((i) => confirms[i.key]) || !run.runner?.online || step?.status === 'done'}
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
                <button type="button" onClick={markManual} disabled={busy || !manualConfirms.filesSent || !manualConfirms.textSent || step?.status === 'done'} className="btn-primary text-sm">
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

      {(run.status === 'round1_docs_sent' || run.status === 'waiting_round1_review_reply') && (
        <p className="mt-2 text-xs text-emerald-700">
          阅览文件已发送。请在下方 S10 卡片扫描群回复，等待导师上传《第一轮审核清单》回复文件。
        </p>
      )}
    </section>
  );
}

// =====================================================================
// S10 第一轮审核清单回复接收归档（P2b）
// 规范：只认导师在已确认群上传、文件名含「第一轮审核清单」的文件；
// 归档时扩展名前加 `_回复`；文字回复走手工登记兜底。
// =====================================================================

type ReplyCandidateView = {
  messageId: string;
  fileKey: string | null;
  fileName: string;
  senderName: string | null;
  createTime: number | null;
  alreadyNamedReply: boolean;
};

type Round1ReplyEvidence = {
  replyScan?: {
    candidates?: ReplyCandidateView[];
    textMessageCount?: number;
    deletedCount?: number;
    skipped?: {
      selfSender: number;
      audio: number;
      otherRound: number;
      keywordMiss: number;
      noFileKey: number;
      otherType: number;
    };
    scannedAt?: string;
  };
  replySelection?: { destName?: string; selectedAt?: string };
  archivedReply?: {
    fileName: string | null;
    destName: string | null;
    senderName: string | null;
    messageId: string | null;
    createTime: number | null;
    bytes: number;
    sha256: string | null;
    archivedAt: string;
  };
};

export function Round1ReplyPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S10');
  const ev = (step?.evidence ?? {}) as Round1ReplyEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const [selected, setSelected] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const showPanel =
    ['round1_docs_sent', 'waiting_round1_review_reply', 'round1_reply_received', 'codex_round1_absorb'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;

  const scan = ev.replyScan;
  const canSubmit =
    canWrite && !running && (run.status === 'waiting_round1_review_reply' || run.status === 'round1_reply_received');
  const skipItems: Array<{ key: string; label: string }> = [];
  const sk = scan?.skipped;
  if (sk) {
    if (sk.selfSender > 0) skipItems.push({ key: 'self', label: `我方发送（陆秉文/机器人）${sk.selfSender}` });
    if (sk.audio > 0) skipItems.push({ key: 'audio', label: `音频 ${sk.audio}` });
    if (sk.otherRound > 0) skipItems.push({ key: 'otherRound', label: `另一轮文件 ${sk.otherRound}` });
    if (sk.keywordMiss > 0) skipItems.push({ key: 'kw', label: `未含「第一轮审核清单」${sk.keywordMiss}` });
    if (sk.noFileKey > 0) skipItems.push({ key: 'nokey', label: `缺文件标识 ${sk.noFileKey}` });
    if (sk.otherType > 0) skipItems.push({ key: 'other', label: `非文件消息 ${sk.otherType}` });
  }
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S10 · 第一轮审核清单回复接收归档</h3>
      <p className="mt-1 text-xs text-stone-500">
        扫描已确认群的消息元数据（正文不落库）。只列导师上传、文件名完整含「第一轮审核清单」七字的文档；
        音频、第二轮文件、我方（陆秉文/机器人）发出的文件一律排除。
      </p>

      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S10' })} />}

      {ev.archivedReply && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-stone-700">
          <div className="font-medium text-emerald-800">回复文件已归档</div>
          <div className="mt-1 space-y-0.5">
            <div>归档名：{ev.archivedReply.destName}</div>
            <div>原始文件：{ev.archivedReply.fileName ?? '—'}</div>
            <div>
              上传人：{ev.archivedReply.senderName ?? '—'}
              {ev.archivedReply.createTime ? ` · ${new Date(ev.archivedReply.createTime).toLocaleString('zh-CN')}` : ''}
            </div>
            <div>字节数：{ev.archivedReply.bytes} · SHA-256：{ev.archivedReply.sha256 ?? '—'}</div>
          </div>
          <p className="mt-1 text-emerald-700">可在 run 未终结前重新扫描归档补充文件（如导师分两次上传）。</p>
        </div>
      )}

      {!ev.archivedReply && (
        <div className="mt-3">
          <button
            type="button"
            disabled={!canWrite || running || step?.status === 'done'}
            onClick={() => guard(() => onAction('scan-round1-reply', {}))}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {running ? '扫描中…' : scan ? '重新扫描群回复' : '扫描群回复'}
          </button>
          {scan?.scannedAt && (
            <span className="ml-2 text-xs text-stone-500">
              上次扫描 {new Date(scan.scannedAt).toLocaleString('zh-CN')} · 命中文件 {scan.candidates?.length ?? 0} 个
              {scan.textMessageCount ? ` · 文本消息 ${scan.textMessageCount} 条` : ''}
            </span>
          )}
        </div>
      )}
      {ev.archivedReply && (
        <div className="mt-3">
          <button
            type="button"
            disabled={!canSubmit || running}
            onClick={() => guard(() => onAction('scan-round1-reply', {}))}
            className="rounded-lg border border-teal-600 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-50 disabled:opacity-40"
          >
            {running ? '扫描中…' : '再次扫描，追加归档回复文件'}
          </button>
          {scan?.scannedAt && (
            <span className="ml-2 text-xs text-stone-500">
              上次扫描 {new Date(scan.scannedAt).toLocaleString('zh-CN')} · 命中文件 {scan.candidates?.length ?? 0} 个
            </span>
          )}
        </div>
      )}

      {skipItems.length > 0 && (
        <p className="mt-1.5 text-xs text-stone-400">
          已跳过：{skipItems.map((i) => i.label).join(' · ')}
        </p>
      )}

      {scan?.candidates && scan.candidates.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {scan.candidates.map((c) => (
            <label
              key={c.messageId}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${
                selected === c.messageId ? 'border-teal-500 bg-teal-50' : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              <input
                type="radio"
                name="s10-reply-candidate"
                className="mt-0.5"
                checked={selected === c.messageId}
                onChange={() => setSelected(c.messageId)}
                disabled={!canSubmit}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-stone-800">{c.fileName}</span>
                <span className="text-stone-500">
                  上传人 {c.senderName ?? '—'}
                  {c.createTime ? ` · ${new Date(c.createTime).toLocaleString('zh-CN')}` : ''}
                  {c.alreadyNamedReply ? ' · 已含「回复」不再追加' : ''}
                </span>
              </span>
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">第一轮审核清单</span>
            </label>
          ))}
          <button
            type="button"
            disabled={!canSubmit || !selected || busy}
            onClick={() => guard(() => onAction('submit-round1-reply', { messageId: selected }))}
            className="mt-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            归档所选回复
          </button>
        </div>
      )}

      {scan && scan.candidates?.length === 0 && !ev.archivedReply && (
        <p className="mt-2 rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
          没有命中的回复文件：需要导师在群内上传文件名完整含「第一轮审核清单」七个字的文档（音频与我方发送的文件不收）。
        </p>
      )}

      <div className="mt-3 border-t border-stone-100 pt-3">
        <div className="text-xs text-stone-600">手工登记兜底（文字回复 / 文件名不规范时）</div>
        <p className="mt-0.5 text-xs text-stone-500">
          把回复保存为文件放入导师目录（mentors/{run.mentorDir}/），在下方填写相对路径登记哈希。
        </p>
        <div className="mt-1.5 flex gap-2">
          <input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder={`mentors/${run.mentorDir}/xxx_回复.md`}
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
            disabled={!canSubmit}
          />
          <button
            type="button"
            disabled={!canSubmit || !manualPath.trim() || busy}
            onClick={() => guard(() => onAction('submit-round1-reply', { manualRelPath: manualPath }))}
            className="shrink-0 rounded-lg border border-teal-600 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-50 disabled:opacity-40"
          >
            登记哈希
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <ImpactNote>
        归档保留原始文件名、上传人、消息标识、上传时间、字节数与 SHA-256；导师回复内容不得改写，发现错误只可人工介入重做。
      </ImpactNote>
    </section>
  );
}

// =====================================================================
// S11 Codex 吸收第一轮回复（P2b）——S6 同构沟通区：
// 固定触发语人工粘贴（Runner 投递未验证前置灰），双证据收步。
// =====================================================================

const ROUND1_ABSORB_TRIGGER = '该导师的第一轮访谈审核清单回复已经到达，请查阅并更新其prompt和知识卡。';

type AbsorbPackageView = {
  name: string;
  mtime: string | null;
  isPreviousRound: boolean;
  afterSubmit: boolean;
  recommended: boolean;
};

type Round1AbsorbEvidence = {
  codexSubmit?: { by: string; at: string; codexThreadId: string | null };
  workPackages?: AbsorbPackageView[];
  absorbReady?: boolean;
  absorbRecommended?: string | null;
  scannedAt?: string;
  absorbConfirm?: { by: string; at: string; workPackage: string };
};

export function Round1AbsorbPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S11');
  const ev = (step?.evidence ?? {}) as Round1AbsorbEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const [threadId, setThreadId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pkg, setPkg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const showPanel =
    ['round1_reply_received', 'codex_round1_absorb'].includes(run.status) || Boolean(step && step.status !== 'pending');

  const done = Boolean(ev.absorbConfirm);
  // 兼容 P2b 早期扫描留下的字符串数组证据；重新扫描后即为带 mtime/标签的对象
  const packages: AbsorbPackageView[] = (ev.workPackages ?? []).map((p) =>
    typeof p === 'string' ? { name: p, mtime: null, isPreviousRound: false, afterSubmit: false, recommended: false } : p,
  );
  const recommended = ev.absorbRecommended ?? null;
  // 扫描结果到达后自动预选推荐包（本轮新包中 mtime 最新者）；用户可手动改选
  useEffect(() => {
    if (recommended && !done) setPkg(recommended);
  }, [recommended, done]);

  if (!showPanel) return null;

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S11 · Codex 吸收第一轮回复</h3>
      <p className="mt-1 text-xs text-stone-500">在 Codex 专属对话粘贴固定触发语；完成后选择其产出的新版本包收步。复用 S6 登记的同一对话。</p>

      <blockquote className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
        {ROUND1_ABSORB_TRIGGER}
        <button
          type="button"
          disabled={step?.status === 'done'}
          onClick={() => void navigator.clipboard.writeText(ROUND1_ABSORB_TRIGGER)}
          className="ml-2 rounded border border-stone-300 px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-white disabled:opacity-40"
        >
          复制
        </button>
      </blockquote>

      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S11' })} />}

      {!ev.codexSubmit && !done && (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={submitted} onChange={(e) => setSubmitted(e.target.checked)} className="mt-0.5" />
            <span>我已把固定触发语粘贴进该导师的 Codex 专属对话并提交</span>
          </label>
          <input
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            placeholder="Codex 对话标识（session/thread UUID，选填，为 S12/S14 复用铺路）"
            className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={!canWrite || !submitted || busy || step?.status === 'done'}
            onClick={() => guard(() => onAction('confirm-round1-absorb', { submittedToConversation: true, codexThreadId: threadId || undefined }))}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
          >
            登记已提交
          </button>
          <p className="text-xs text-stone-400">「由 Runner 投递」在 Codex 非交互投递实测稳定前保持置灰（M5 待做）。</p>
        </div>
      )}

      {ev.codexSubmit && !done && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-emerald-700">
            已登记提交（{new Date(ev.codexSubmit.at).toLocaleString('zh-CN')})
            {ev.codexSubmit.codexThreadId ? ` · 对话标识 ${ev.codexSubmit.codexThreadId}` : ' · 未登记对话标识'}
          </p>
          <p className="text-xs text-stone-600">Codex 更新完 prompt 和知识卡后，扫描 work 目录确认新版本包：</p>
          <button
            type="button"
            disabled={!canWrite || running || step?.status === 'done'}
            onClick={() => guard(() => onAction('scan-work-for-absorb', {}))}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {running ? '扫描中…' : packages.length > 0 ? '重新扫描 work 目录' : '扫描 work 目录'}
          </button>
          {ev.scannedAt && <span className="ml-2 text-xs text-stone-500">上次扫描 {new Date(ev.scannedAt).toLocaleString('zh-CN')}</span>}
          {packages.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {packages.map((p) => (
                <label
                  key={p.name}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs ${
                    pkg === p.name ? 'border-teal-500 bg-teal-50' : 'border-stone-200 hover:border-stone-300'
                  } ${!p.afterSubmit ? 'opacity-55' : ''}`}
                >
                  <input type="radio" name="s11-package" checked={pkg === p.name} onChange={() => setPkg(p.name)} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-stone-800">{p.name}</span>
                    <span className="text-stone-500">
                      00_START_HERE 更新于 {p.mtime ? new Date(p.mtime).toLocaleString('zh-CN') : '—'}
                    </span>
                  </span>
                  {p.recommended ? (
                    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">本轮新包 · 推荐</span>
                  ) : p.isPreviousRound && p.afterSubmit ? (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                      S7 旧包但有更新 · 人工确认
                    </span>
                  ) : p.isPreviousRound ? (
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">S7 已核验</span>
                  ) : (
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">提交前已存在</span>
                  )}
                </label>
              ))}
            </div>
          )}
          {packages.length > 0 && !ev.absorbReady && (
            <p className="text-xs text-amber-700">
              没有发现提交时刻之后生成的新版本包，Codex 可能尚未完成；完成后请重新扫描。
              若 Codex 是就地更新了 S7 旧包，核对其更新时间后可手动选择带「人工确认」标签的包。
            </p>
          )}
          {packages.length === 0 && (
            <p className="text-xs text-stone-500">work 目录暂无版本包；等 Codex 完成后再扫描。</p>
          )}
          <button
            type="button"
            disabled={!canWrite || !pkg || busy || step?.status === 'done'}
            onClick={() => guard(() => onAction('confirm-round1-absorb', { workPackage: pkg }))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            确认吸收完成
          </button>
        </div>
      )}

      {done && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          已确认吸收完成（{new Date(ev.absorbConfirm!.at).toLocaleString('zh-CN')}）· 版本包 {ev.absorbConfirm!.workPackage}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <ImpactNote>Codex 产物由 Codex 与人工核验负责，工作台只登记对话标识与版本包证据，不代写内容。</ImpactNote>
    </section>
  );
}

// =====================================================================
// P2c：S12-S16 第二轮全链路面板
// =====================================================================

function useGuard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, guard };
}

// ------------------------------------------------------------------
// S12：第二轮官方大纲发送（G2：1 条文本 = 固定文案 + 官方云文档链接）
// ------------------------------------------------------------------

export function Round2OutlinePanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S12');
  const ev = (step?.evidence ?? {}) as SendEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const [confirms, setConfirms] = useState<Record<string, boolean>>({});
  const [manualSent, setManualSent] = useState(false);
  const [manualNote, setManualNote] = useState('');
  const { busy, error, guard } = useGuard();

  const showPanel =
    [
      'codex_round1_absorb',
      'round2_outline_sent',
      'waiting_round2_submission',
      'round2_material_received',
    ].includes(run.status) || Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;

  const sent = (ev.sendLog?.length ?? 0) > 0 || Boolean(ev.manualSend);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S12 · 发送第二轮访谈大纲（G2）</h3>
      <p className="mt-1 text-xs text-stone-500">
        只发 1 条文本消息：固定文案 + 官方大纲云文档链接（飞书自动识别为文档卡片）。禁止另写大纲、禁止发文件、禁止改写链接。
      </p>

      <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
        <p className="text-xs font-semibold text-stone-600">待发送内容（逐字不改）</p>
        <blockquote className="mt-1 whitespace-pre-line border-l-2 border-stone-300 pl-2 text-xs leading-5 text-stone-700">
          {G2_OUTLINE_MESSAGE}
        </blockquote>
        <p className="mt-1 break-all text-[11px] text-stone-400">官方链接：{G2_OUTLINE_LINK}</p>
        <p className="mt-1 text-[11px] text-stone-400">目标群：{run.feishuChatName || run.feishuChatId}</p>
      </div>

      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S12' })} />}

      {run.status === 'codex_round1_absorb' && !sent && !running && canWrite && (
        <div className="mt-3 rounded-xl border border-stone-200 p-3">
          <div className="space-y-1.5">
            {[
              { key: 'chatConfirmed', label: '目标群已确认（与第一轮同一导师沟通群）' },
              { key: 'linkUnchanged', label: '官方大纲链接逐字未改写（上面的云文档链接）' },
              { key: 'copyUnchanged', label: `固定文案逐字未改写（${G2_OUTLINE_TEXT}）` },
            ].map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-xs text-stone-600">
                <input type="checkbox" checked={Boolean(confirms[item.key])} onChange={(e) => setConfirms((c) => ({ ...c, [item.key]: e.target.checked }))} />
                {item.label}
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !Object.values(confirms).every(Boolean) || !run.runner?.online || step?.status === 'done'}
              onClick={() => guard(() => onAction('approve-send-round2-outline', { confirm: confirms }))}
              className="btn-primary text-sm"
            >
              {busy ? '已入队…' : '批准 Runner 发送大纲'}
            </button>
            {!run.runner?.online && <span className="text-xs text-red-500">Runner 离线</span>}
          </div>
          <ImpactNote>机器人「榨职机助手」过审前自动发送可能失败；失败不会自动重发，可改走下方人工补录。</ImpactNote>
        </div>
      )}

      {running && <p className="mt-3 text-xs text-stone-500">发送指令执行中…</p>}

      {!sent && (step?.status === 'failed' || run.status === 'failed') && canWrite && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
          <p className="text-xs text-red-600">Runner 发送失败或机器人尚无对外发送能力。请人工在群内发送上方文案+链接后登记：</p>
          <label className="mt-2 flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={manualSent} onChange={(e) => setManualSent(e.target.checked)} />
            我已人工在群内发送第二轮大纲消息（文案+官方链接同一条）
          </label>
          <input
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            placeholder="备注（可选，例如群内消息链接）"
            className="mt-1.5 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busy || !manualSent || step?.status === 'done'}
            onClick={() => guard(() => onAction('mark-round2-outline-manual-send', { confirm: { sent: true }, note: manualNote }))}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
          >
            标记人工已发送
          </button>
        </div>
      )}

      {ev.sendLog && ev.sendLog.length > 0 && (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
          Runner 已发送（{new Date(ev.sendLog[0].at).toLocaleString('zh-CN')}）· 消息 {ev.sendLog[0].messageId ? `om:${ev.sendLog[0].messageId.slice(0, 10)}…` : '已确认'}
        </div>
      )}
      {ev.manualSend && (
        <p className="mt-2 text-xs text-stone-500">已登记人工发送（{new Date(ev.manualSend.at).toLocaleString('zh-CN')}）{ev.manualSend.note ? ` · ${ev.manualSend.note}` : ''}</p>
      )}
      {sent && (
        <p className="mt-2 text-xs text-emerald-700">大纲已送达。请在下方 S13 卡片等待并识别导师的第二轮访谈提交事件。</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

// ------------------------------------------------------------------
// S13：第二轮材料事件分组识别 + 归档（audio/word 第二轮目录）
// ------------------------------------------------------------------

type MaterialFileView = {
  messageId: string;
  fileKey: string | null;
  fileName: string;
  kind: 'audio' | 'transcript' | 'other';
  senderName: string | null;
  createTime: number | null;
  msgType: string;
  conflictHint: boolean;
};

type MaterialGroupView = {
  id: string;
  startAt: number | null;
  endAt: number | null;
  files: MaterialFileView[];
  hasAudio: boolean;
  suggested: boolean;
};

type MaterialScanView = {
  groups: MaterialGroupView[];
  suggestedGroupId: string | null;
  ambiguity: string[];
  skipped: {
    selfSender: number;
    beforeSince: number;
    deleted: number;
    text: number;
    otherType: number;
    noFileKey: number;
    firstRound: number;
    reviewDoc: number;
    archivedBefore: number;
  };
  sinceTime: number | null;
  scannedAt?: string;
};

type Round2MaterialEvidence = {
  scanSince?: string | null;
  materialScan?: MaterialScanView;
  materialSelection?: { ids?: string[]; files?: string[]; manual?: boolean; selectedAt?: string };
  materialArchived?: Array<{ messageId: string | null; fileName: string; destName?: string; slot: string; bytes: number; sha256: string | null; at: string }>;
};

export function Round2MaterialPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S13');
  const ev = (step?.evidence ?? {}) as Round2MaterialEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const scan = ev.materialScan;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manualText, setManualText] = useState('');
  const { busy, error, guard } = useGuard();

  const showPanel =
    ['round2_outline_sent', 'waiting_round2_submission', 'round2_material_received', 'codex_round2_update'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;

  const received = run.status === 'round2_material_received' || run.status === 'codex_round2_update' || (ev.materialArchived?.length ?? 0) > 0;
  const canAct = canWrite && !running && ['waiting_round2_submission', 'round2_material_received', 'failed'].includes(run.status);

  // 扫描结果刷新后：默认勾选 suggested 组的全部文件
  useEffect(() => {
    if (!scan) return;
    const sg = scan.groups.find((g) => g.suggested);
    setPicked(new Set((sg ?? scan.groups[0])?.files.filter((f) => f.fileKey).map((f) => f.messageId) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.scannedAt]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (g: MaterialGroupView) =>
    setPicked((prev) => {
      const ids = g.files.filter((f) => f.fileKey).map((f) => f.messageId);
      const allIn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });

  const pickedFiles = scan ? scan.groups.flatMap((g) => g.files).filter((f) => picked.has(f.messageId)) : [];
  const hasAudioPicked = pickedFiles.some((f) => f.kind === 'audio');
  const manualFiles = manualText.split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S13 · 第二轮访谈材料识别与归档</h3>
      <p className="mt-1 text-xs text-stone-500">
        时间窗从 S12 大纲发送时刻起，窗内按 30 分钟间隔把提交事件聚类成组：第一个含音频且文件名无补传/重传信号的组为建议组。
        文件名含「第一轮」「审核清单」的一律不进候选；无上传时间且已在 S1/S2/S10 归档过的不再重复出现。
        音频与文稿分别归档到导师「第二轮 interview audio / word」目录。
      </p>
      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S13' })} />}

      <div className="mt-3">
        <button
          type="button"
          disabled={!canWrite || running || step?.status === 'done'}
          onClick={() => guard(() => onAction('scan-round2-material', {}))}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {step?.status === 'done' ? '已归档完成' : running ? '扫描中…' : scan ? '重新扫描群消息' : '扫描第二轮提交事件'}
        </button>
        {scan?.scannedAt && (
          <span className="ml-2 text-xs text-stone-500">
            上次扫描 {new Date(scan.scannedAt).toLocaleString('zh-CN')} · {scan.groups.length} 个事件组
          </span>
        )}
      </div>

      {scan && scan.ambiguity.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-xs font-semibold text-amber-800">存在需要人工判断的信号：</p>
          <ul className="mt-1 list-disc pl-4 text-xs leading-5 text-amber-800">
            {scan.ambiguity.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {scan && (
        <p className="mt-1.5 text-xs text-stone-400">
          已跳过：我方发送 {scan.skipped.selfSender} · S12 之前 {scan.skipped.beforeSince} · 已撤回 {scan.skipped.deleted} · 纯文本{' '}
          {scan.skipped.text} · 其他类型 {scan.skipped.otherType} · 含「第一轮」{scan.skipped.firstRound} · 审核清单类 {scan.skipped.reviewDoc} ·
          已归档过 {scan.skipped.archivedBefore}
        </p>
      )}

      {scan && scan.groups.length > 0 && (
        <div className="mt-3 space-y-2">
          {scan.groups.map((g) => (
            <div key={g.id} className={`rounded-xl border p-2.5 ${g.suggested ? 'border-emerald-300 bg-emerald-50/40' : 'border-stone-200'}`}>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={g.files.filter((f) => f.fileKey).every((f) => picked.has(f.messageId))} onChange={() => toggleGroup(g)} disabled={!canAct} />
                <span className="font-medium">
                  事件组 {g.id} · {g.files.length} 个文件
                </span>
                <span className="text-stone-400">
                  {g.startAt ? new Date(g.startAt).toLocaleString('zh-CN') : '时间未知'}
                </span>
                {g.hasAudio && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-800">含音频</span>}
                {g.suggested && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">建议组</span>}
              </label>
              <ul className="mt-1.5 space-y-1 pl-6">
                {g.files.map((f) => (
                  <li key={f.messageId}>
                    <label className="flex cursor-pointer items-start gap-2 text-xs">
                      <input type="checkbox" checked={picked.has(f.messageId)} onChange={() => toggle(f.messageId)} disabled={!canAct || !f.fileKey} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="break-all text-stone-700">{f.fileName}</span>
                        <span className="ml-1 text-stone-400">
                          {f.senderName ?? '未知发送人'}
                          {f.createTime ? ` · ${new Date(f.createTime).toLocaleString('zh-CN')}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0">
                        {f.kind === 'audio' ? (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-800">音频</span>
                        ) : f.kind === 'transcript' ? (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800">文稿</span>
                        ) : (
                          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">其他</span>
                        )}
                        {f.conflictHint && (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">文件名含第一轮/补传/重传</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {canAct && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || picked.size === 0 || !hasAudioPicked}
                onClick={() => guard(() => onAction('submit-round2-material', { messageIds: Array.from(picked) }))}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {busy ? '下载归档中…' : `归档所选 ${picked.size} 个文件`}
              </button>
              {!hasAudioPicked && <span className="text-xs text-amber-700">所选文件必须至少包含一个音频</span>}
            </div>
          )}
        </div>
      )}

      {scan && scan.groups.length === 0 && (
        <p className="mt-2 rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
          S12 发送之后尚无提交事件。若材料实际已到（例如机器人拉取权限受限），可用下方手工登记。
        </p>
      )}

      <div className="mt-3 border-t border-stone-100 pt-3">
        <div className="text-xs text-stone-600">手工登记兜底（一行一个相对路径，须在导师第二轮 interview audio/word 目录内）</div>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          rows={2}
          placeholder={`mentors/${run.mentorDir}/${run.mentorDir} audio/${run.mentorDir} 第二轮 interview audio/xxx.m4a`}
          className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
          disabled={!canAct}
        />
        <button
          type="button"
          disabled={!canAct || manualFiles.length === 0 || busy}
          onClick={() => guard(() => onAction('submit-round2-material', { manualFiles }))}
          className="mt-1 rounded-lg border border-teal-600 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-50 disabled:opacity-40"
        >
          按路径哈希登记（{manualFiles.length}）
        </button>
      </div>

      {(() => {
        // 已归档清单只列本步归档的源文件（源音频/源文稿）；归并稿归属下方登记卡，不在此重复展示
        const round2Arts = run.artifacts.filter(
          (a) => ['source_audio', 'source_transcript'].includes(a.kind) && a.displayPath?.includes('第二轮 interview'),
        );
        const kindLabel: Record<string, string> = { source_audio: '音频', source_transcript: '文稿' };
        const kindOrder = ['source_audio', 'source_transcript'];
        const sorted = [...round2Arts].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
        return (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-stone-700">
            <div className="font-medium text-emerald-800">已归档 {sorted.length} 个第二轮材料文件</div>
            {sorted.length === 0 ? (
              <p className="mt-1 text-stone-500">尚无第二轮材料登记。</p>
            ) : (
              <ul className="mt-1 list-disc pl-4">
                {sorted.map((a, i) => (
                  <li key={i}>
                    [{kindLabel[a.kind] ?? a.kind}] {a.displayPath?.split('/').pop()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}
      {received && <p className="mt-2 text-xs text-emerald-700">第二轮材料已收齐，进入下方 S14 通知 Codex 更新。</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <ImpactNote>系统只做事件聚类与建议，不机械判定轮次：补传、重传、多片段必须由你确认后才会归档。</ImpactNote>
    </section>
  );
}

// ------------------------------------------------------------------
// S14：Codex 第二轮候选更新（S11 同构；基准包 = S11 收步包）
// ------------------------------------------------------------------

type Round2UpdateEvidence = Round1AbsorbEvidence & {
  updateConfirm?: { by: string; at: string; workPackage: string };
};

export function Round2UpdatePanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S14');
  const s11 = run.steps.find((s) => s.code === 'S11');
  const s11Pkg = ((s11?.evidence ?? {}) as { absorbConfirm?: { workPackage?: string } }).absorbConfirm?.workPackage ?? null;
  const ev = (step?.evidence ?? {}) as Round2UpdateEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const [threadId, setThreadId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pkg, setPkg] = useState('');
  const { busy, error, guard } = useGuard();

  const showPanel =
    ['round2_material_received', 'codex_round2_update', 'round2_docs_qc', 'round2_docs_qc_failed'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;

  const done = Boolean(ev.updateConfirm);
  const packages: AbsorbPackageView[] = (ev.workPackages ?? []).map((p) =>
    typeof p === 'string' ? { name: p, mtime: null, isPreviousRound: false, afterSubmit: false, recommended: false } : p,
  );
  useEffect(() => {
    if (ev.absorbRecommended && !done) setPkg(ev.absorbRecommended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.absorbRecommended, done]);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S14 · Codex 第二轮候选更新</h3>
      <p className="mt-1 text-xs text-stone-500">
        在 Codex 专属对话粘贴第二轮更新触发语；完成后扫描 work 目录选择新包收步。第一轮基准包：
        <span className="font-medium text-stone-600">{s11Pkg ?? '（S11 未登记）'}</span>
      </p>

      <blockquote className="mt-2 whitespace-pre-line rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
        {ROUND2_UPDATE_TRIGGER}
        <button
          type="button"
          disabled={step?.status === 'done'}
          onClick={() => void navigator.clipboard.writeText(ROUND2_UPDATE_TRIGGER)}
          className="ml-2 rounded border border-stone-300 px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-white disabled:opacity-40"
        >
          复制
        </button>
      </blockquote>

      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S14' })} />}

      {!ev.codexSubmit && !done && (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={submitted} onChange={(e) => setSubmitted(e.target.checked)} className="mt-0.5" />
            <span>我已把第二轮更新触发语粘贴进该导师的 Codex 专属对话并提交</span>
          </label>
          <input
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            placeholder="Codex 对话标识（选填）"
            className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={!canWrite || !submitted || busy}
            onClick={() => guard(() => onAction('confirm-round2-update', { submittedToConversation: true, codexThreadId: threadId || undefined }))}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
          >
            登记已提交
          </button>
        </div>
      )}

      {ev.codexSubmit && !done && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-emerald-700">已登记提交（{new Date(ev.codexSubmit.at).toLocaleString('zh-CN')}）</p>
          <button
            type="button"
            disabled={!canWrite || running}
            onClick={() => guard(() => onAction('scan-work-for-round2-update', {}))}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {running ? '扫描中…' : packages.length > 0 ? '重新扫描 work 目录' : '扫描 work 目录'}
          </button>
          {ev.scannedAt && <span className="ml-2 text-xs text-stone-500">上次扫描 {new Date(ev.scannedAt).toLocaleString('zh-CN')}</span>}
          {packages.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {packages.map((p) => (
                <label
                  key={p.name}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs ${
                    pkg === p.name ? 'border-teal-500 bg-teal-50' : 'border-stone-200'
                  } ${!p.afterSubmit ? 'opacity-55' : ''}`}
                >
                  <input type="radio" name="s14-package" checked={pkg === p.name} onChange={() => setPkg(p.name)} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-stone-800">{p.name}</span>
                    <span className="text-stone-500">00_START_HERE 更新于 {p.mtime ? new Date(p.mtime).toLocaleString('zh-CN') : '—'}</span>
                  </span>
                  {p.recommended ? (
                    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">第二轮新包 · 推荐</span>
                  ) : p.isPreviousRound ? (
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">第一轮基准包</span>
                  ) : (
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">提交前已存在</span>
                  )}
                </label>
              ))}
            </div>
          )}
          {packages.length > 0 && !ev.absorbReady && (
            <p className="text-xs text-amber-700">没有发现提交时刻之后的新包，Codex 可能尚未完成；完成后请重新扫描。</p>
          )}
          <button
            type="button"
            disabled={!canWrite || !pkg || busy}
            onClick={() => guard(() => onAction('confirm-round2-update', { workPackage: pkg }))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            确认第二轮更新完成
          </button>
        </div>
      )}

      {done && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          已确认第二轮更新完成（{new Date(ev.updateConfirm!.at).toLocaleString('zh-CN')}）· 版本包 {ev.updateConfirm!.workPackage}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <ImpactNote>第二轮候选包与审核材料均由 Codex 产出，工作台只登记证据，不代写、不预判包内容。</ImpactNote>
    </section>
  );
}

// ------------------------------------------------------------------
// S15：第二轮审核清单定位 + AI 四维比对（ying wang + phyllis chi 双参考）+ G3 发送
// ------------------------------------------------------------------

type Round2QcEvidence = {
  locateRound2?: {
    docs: LocatedDoc[];
    refs: LocatedDoc[];
    missing?: string[];
    ambiguous?: boolean;
    locatedAt: string;
  };
  compareRound2?: { results: CompareResult[]; aiPass: boolean; at: string };
  qcRound2?: { decision: 'pass' | 'reject'; aiPass?: boolean; overridden?: boolean; note?: string | null; decidedAt: string };
};

const G3_CONFIRM_ITEMS: Array<{ key: 'filesRead' | 'qcSeen' | 'chatConfirmed' | 'copyUnchanged'; label: string }> = [
  { key: 'filesRead', label: '第二轮审核清单已通读' },
  { key: 'qcSeen', label: 'AI 四维评分与裁决结论已看过' },
  { key: 'chatConfirmed', label: '目标群已确认（群名与 Run 绑定群一致）' },
  { key: 'copyUnchanged', label: 'G3 固定文案未改动，按原文发送' },
];

export function Round2DocsQcPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S15');
  const ev = (step?.evidence ?? {}) as Round2QcEvidence & SendEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const [note, setNote] = useState('');
  const [confirms, setConfirms] = useState<Record<string, boolean>>({});
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [manualNote, setManualNote] = useState('');
  const { busy, error, guard } = useGuard();

  const showPanel =
    [
      'round2_docs_qc',
      'round2_docs_qc_failed',
      'awaiting_send_approval_round2_docs',
      'round2_docs_sent',
      'waiting_round2_review_reply',
      'round2_reply_received',
      'codex_final_absorb',
    ].includes(run.status) || Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;

  const locate = ev.locateRound2;
  const compare = ev.compareRound2;
  const qc = ev.qcRound2;
  const locateReady = !!locate && !locate.ambiguous && (locate.missing?.length ?? 0) === 0;
  const reviewDocs = run.artifacts.filter((a) => a.kind === 'round2_review_doc');
  const sent = (ev.sendLog?.length ?? 0) > 0 || Boolean(ev.manualSend);

  return (
    <section className="letter-paper rounded-[18px] p-4">
      <h3 className="text-sm font-bold text-stone-700">S15 · 第二轮审核清单 AI 比对 + G3 发送</h3>
      <p className="mt-0.5 text-xs text-stone-400">
        步骤状态：{labelOf(STEP_STATUS_LABELS, step?.status)}
        {step?.failureReason && <span className="ml-2 text-red-600">{step.failureReason}</span>}
      </p>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        只比对第二轮审核清单一类文件（无风格分析），候选仅限 S14 收步版本包，参考固定两份：ying wang ying-v0.3 包 + phyllis chi phyllischi-v0.4-card-approved 包（各自排除被审导师本人）。
        四维评分、80% 门槛与裁决规则同 S8；通过后发送 1 份文件 + G3 固定文案。
      </p>

      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S15' })} />}

      {canWrite && ['round2_docs_qc', 'round2_docs_qc_failed'].includes(run.status) && (
        <button type="button" onClick={() => guard(() => onAction('start-round2-docs-qc', {}))} disabled={busy || !run.runner?.online} className="btn-primary mt-3 text-sm">
          {busy ? '已入队…' : !locate ? '开始定位第二轮清单' : '重新定位'}
        </button>
      )}
      {step && !locate && running && <p className="mt-3 text-xs text-stone-500">正在 S14 版本包内定位第二轮审核清单…</p>}

      {locate && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-xs">
            <p className="font-semibold text-stone-600">候选清单（1 份）</p>
            <ul className="mt-1">
              {locate.docs.map((d) => (
                <li key={d.relPath} className="truncate text-stone-700" title={d.relPath}>
                  {d.relPath} · {d.version ?? '—'} · {formatBytes(d.bytes)}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-semibold text-stone-600">固定参考（{locate.refs.length} 份）</p>
            <ul className="mt-1">
              {locate.refs.map((d) => (
                <li key={d.relPath} className="truncate text-stone-500" title={d.relPath}>
                  [{d.refMentor}] {d.relPath}
                </li>
              ))}
            </ul>
            {(locate.missing?.length ?? 0) > 0 && <p className="mt-1 text-red-600">未定位到：{locate.missing!.join('、')}</p>}
            {locate.ambiguous && <p className="mt-1 text-red-600">候选多于 1 份或参考多于预期份数，存在歧义，请人工确认后重新发起。</p>}
          </div>

          {locateReady && !compare && ['round2_docs_qc', 'round2_docs_qc_failed'].includes(run.status) && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => guard(() => onAction('start-round2-ai-compare', {}))} disabled={busy || !run.runner?.online} className="btn-primary text-sm">
                {busy ? '已入队…' : '发起 AI 四维比对'}
              </button>
              {!run.runner?.online && <span className="text-xs text-red-500">Runner 离线</span>}
            </div>
          )}
          {locateReady && !compare && running && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 text-xs text-cyan-900">
              AI 比对进行中：Runner 读取候选与参考正文后调用评分，通常 30-60 秒，本页会自动刷新。
            </div>
          )}

          {compare && (
            <div className="space-y-3">
              <div className={`rounded-xl border p-3 text-xs ${compare.aiPass ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-amber-200 bg-amber-50/60 text-amber-900'}`}>
                {compare.aiPass
                  ? `AI 评定四维全部 ≥80%，建议放行（${new Date(compare.at).toLocaleString('zh-CN')}）。`
                  : `AI 评定存在低于 80% 的维度（${new Date(compare.at).toLocaleString('zh-CN')}）。可驳回交 Codex 修订，或填依据后人工放行。`}
              </div>
              {compare.results.map((r) => (
                <CompareResultCard key={r.relPath} r={r} />
              ))}
            </div>
          )}

          {qc && (
            <div className={`rounded-xl border p-3 text-xs ${qc.decision === 'pass' ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-red-200 bg-red-50/60 text-red-700'}`}>
              已裁决：{qc.decision === 'pass' ? `放行${qc.overridden ? '（人工 override AI 结论）' : ''}` : '驳回，交回 Codex 修订'}
              {qc.note ? ` —— ${qc.note}` : ''}
              <span className="ml-2 text-stone-400">{new Date(qc.decidedAt).toLocaleString('zh-CN')}</span>
            </div>
          )}

          {compare && !qc && run.status === 'round2_docs_qc' && canWrite && (
            <div className="rounded-xl border border-stone-200 p-3">
              <p className="text-xs font-semibold text-stone-600">人工裁决（AI 是证据，你是门禁）</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={compare.aiPass ? '裁决备注（可选）' : '低于 80%：放行依据 ≥10 字；驳回原因 ≥5 字'}
                className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => guard(() => onAction('round2-qc', { decision: 'pass', note }))}
                  disabled={busy || (!compare.aiPass && note.trim().length < 10)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  通过，进入 G3 发送批准
                </button>
                <button
                  type="button"
                  onClick={() => guard(() => onAction('round2-qc', { decision: 'reject', note }))}
                  disabled={busy || note.trim().length < 5}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
                >
                  驳回，交回 Codex 修订
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* G3 发送批准 */}
      {run.status === 'awaiting_send_approval_round2_docs' && !sent && canWrite && (
        <div className="mt-3 rounded-xl border border-stone-200 p-3">
          <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-3">
            <p className="text-xs font-semibold text-stone-600">待发送内容（1 份文件 + 1 条固定文案）</p>
            <ul className="mt-1">{reviewDocs.map((a) => <ArtifactRow key={a.id} a={a} />)}</ul>
            <blockquote className="mt-2 border-l-2 border-stone-300 pl-2 text-xs leading-5 text-stone-600">{G3_ROUND2_DOCS_TEXT}</blockquote>
          </div>
          <div className="mt-2 space-y-1.5">
            {G3_CONFIRM_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-xs text-stone-600">
                <input type="checkbox" checked={Boolean(confirms[item.key])} onChange={(e) => setConfirms((c) => ({ ...c, [item.key]: e.target.checked }))} />
                {item.label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => guard(() => onAction('approve-send-round2-docs', { confirm: confirms }))}
            disabled={busy || !G3_CONFIRM_ITEMS.every((i) => confirms[i.key]) || !run.runner?.online}
            className="btn-primary mt-2 text-sm"
          >
            {busy ? '已入队…' : '批准发送：第二轮审核清单'}
          </button>
          {!run.runner?.online && <span className="ml-2 text-xs text-red-500">Runner 离线</span>}
          <ImpactNote>授权范围：仅本次向群发送 1 份清单 + 1 条 G3 文案；带 dedup 键与逐条幂等键，禁止自动重发。</ImpactNote>
        </div>
      )}

      {/* 发送失败人工补录 */}
      {(step?.status === 'failed' || run.status === 'failed') && !sent && canWrite && run.status !== 'round2_docs_qc_failed' && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
          <p className="text-xs text-red-600">Runner 发送失败。请人工在群内发送清单文件与 G3 文案后登记：</p>
          <label className="mt-2 flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={Boolean(manual.fileSent)} onChange={(e) => setManual((c) => ({ ...c, fileSent: e.target.checked }))} />
            我已人工发送第二轮审核清单文件
          </label>
          <label className="mt-1 flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={Boolean(manual.textSent)} onChange={(e) => setManual((c) => ({ ...c, textSent: e.target.checked }))} />
            我已人工发送 G3 固定文案
          </label>
          <input value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="备注（可选）" className="mt-1.5 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs" />
          <button
            type="button"
            disabled={busy || !manual.fileSent || !manual.textSent}
            onClick={() => guard(() => onAction('mark-round2-docs-manual-send', { confirm: { fileSent: true, textSent: true }, note: manualNote }))}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
          >
            标记人工已发送
          </button>
        </div>
      )}

      {/* awaiting 状态但机器人不可用时也展示人工入口（补录是当前主要通道） */}
      {run.status === 'awaiting_send_approval_round2_docs' && !sent && canWrite && (
        <details className="mt-2 rounded-lg border border-stone-200 p-2 text-xs text-stone-500">
          <summary className="cursor-pointer">机器人无法发送时：人工发送后补录</summary>
          <div className="mt-2 space-y-1.5">
            <label className="flex items-center gap-2 text-stone-600">
              <input type="checkbox" checked={Boolean(manual.fileSent)} onChange={(e) => setManual((c) => ({ ...c, fileSent: e.target.checked }))} />
              我已人工发送清单文件
            </label>
            <label className="flex items-center gap-2 text-stone-600">
              <input type="checkbox" checked={Boolean(manual.textSent)} onChange={(e) => setManual((c) => ({ ...c, textSent: e.target.checked }))} />
              我已人工发送 G3 文案
            </label>
            <button
              type="button"
              disabled={busy || !manual.fileSent || !manual.textSent}
              onClick={() => guard(() => onAction('mark-round2-docs-manual-send', { confirm: { fileSent: true, textSent: true } }))}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-700 disabled:opacity-40"
            >
              标记人工已发送
            </button>
          </div>
        </details>
      )}

      {ev.sendLog && ev.sendLog.length > 0 && (
        <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
          <p className="text-xs font-semibold text-stone-600">飞书发送记录</p>
          <ul className="mt-1">
            {ev.sendLog.map((l) => (
              <li key={l.at + String(l.index)} className="px-2 py-0.5 text-xs text-stone-500">
                #{l.index + 1} {l.kind === 'text' ? '文案' : '文件'} · {l.label ?? '—'} · {new Date(l.at).toLocaleTimeString('zh-CN')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ev.manualSend && <p className="mt-2 text-xs text-stone-500">已登记人工发送（{new Date(ev.manualSend.at).toLocaleString('zh-CN')}）</p>}
      {(run.status === 'round2_docs_sent' || run.status === 'waiting_round2_review_reply') && (
        <p className="mt-2 text-xs text-emerald-700">第二轮清单已发送。请在下方 S16 卡片等待导师回复。</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

// ------------------------------------------------------------------
// S16：第二轮回复归档 + Codex 最终吸收（不选包）
// ------------------------------------------------------------------

type Round2ReplyEvidence = Round1ReplyEvidence & {
  replyScanRound2?: Round1ReplyEvidence['replyScan'];
  replySelectionRound2?: Round1ReplyEvidence['replySelection'] & { manual?: boolean };
  archivedReplyRound2?: Round1ReplyEvidence['archivedReply'] & { manual?: boolean };
  codexSubmit?: { by: string; at: string; codexThreadId: string | null };
  finalAbsorbConfirm?: { by: string; at: string };
};

export function Round2ReplyPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S16');
  const ev = (step?.evidence ?? {}) as Round2ReplyEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const [selected, setSelected] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [threadId, setThreadId] = useState('');
  const [absorbDoneChecked, setAbsorbDoneChecked] = useState(false);
  const { busy, error, guard } = useGuard();

  const showPanel =
    ['round2_docs_sent', 'waiting_round2_review_reply', 'round2_reply_received', 'codex_final_absorb'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;

  const scan = ev.replyScanRound2;
  const archived = ev.archivedReplyRound2;
  const canScanSubmit = canWrite && !running && ['round2_docs_sent', 'waiting_round2_review_reply', 'round2_reply_received'].includes(run.status);
  const canAbsorb = canWrite && run.status === 'round2_reply_received';

  const skipItems: Array<string> = [];
  const sk = scan?.skipped;
  if (sk) {
    if (sk.selfSender > 0) skipItems.push(`我方发送 ${sk.selfSender}`);
    if (sk.audio > 0) skipItems.push(`音频 ${sk.audio}`);
    if (sk.otherRound > 0) skipItems.push(`第一轮文件 ${sk.otherRound}`);
    if (sk.keywordMiss > 0) skipItems.push(`未含「第二轮审核清单」${sk.keywordMiss}`);
    if (sk.noFileKey > 0) skipItems.push(`缺文件标识 ${sk.noFileKey}`);
    if (sk.otherType > 0) skipItems.push(`非文件消息 ${sk.otherType}`);
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S16 · 第二轮审核清单回复归档 + Codex 最终吸收</h3>
      <p className="mt-1 text-xs text-stone-500">
        只认导师在已确认群上传、文件名含「第二轮审核清单」的文档（排除「第一轮」）；归档名扩展名前加「_回复」。
        归档后通知 Codex 做最终吸收；最终交接包不由本步选择，留待后续步骤发现。
      </p>
      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S16' })} />}

      {archived && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-stone-700">
          <div className="font-medium text-emerald-800">第二轮回复已归档{archived.manual ? '（手工登记）' : ''}</div>
          <div className="mt-1">归档名：{archived.destName}</div>
          <div>
            上传人：{archived.senderName ?? '—'}
            {archived.createTime ? ` · ${new Date(archived.createTime).toLocaleString('zh-CN')}` : ''}
          </div>
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          disabled={!canScanSubmit}
          onClick={() => guard(() => onAction('scan-round2-reply', {}))}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {running ? '扫描中…' : scan ? '重新扫描群回复' : '扫描群回复'}
        </button>
        {scan?.scannedAt && (
          <span className="ml-2 text-xs text-stone-500">
            上次扫描 {new Date(scan.scannedAt).toLocaleString('zh-CN')} · 命中 {scan.candidates?.length ?? 0} 个
          </span>
        )}
      </div>
      {skipItems.length > 0 && <p className="mt-1.5 text-xs text-stone-400">已跳过：{skipItems.join(' · ')}</p>}

      {scan?.candidates && scan.candidates.length > 0 && !archived && (
        <div className="mt-3 space-y-1.5">
          {scan.candidates.map((c) => (
            <label
              key={c.messageId}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${
                selected === c.messageId ? 'border-teal-500 bg-teal-50' : 'border-stone-200'
              }`}
            >
              <input type="radio" name="s16-reply" className="mt-0.5" checked={selected === c.messageId} onChange={() => setSelected(c.messageId)} disabled={!canScanSubmit} />
              <span className="min-w-0 flex-1">
                <span className="block break-all text-stone-800">{c.fileName}</span>
                <span className="text-stone-500">
                  {c.senderName ?? '—'}
                  {c.createTime ? ` · ${new Date(c.createTime).toLocaleString('zh-CN')}` : ''}
                </span>
              </span>
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">第二轮审核清单</span>
            </label>
          ))}
          <button
            type="button"
            disabled={!canScanSubmit || !selected || busy}
            onClick={() => guard(() => onAction('submit-round2-reply', { messageId: selected }))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            归档所选回复
          </button>
        </div>
      )}

      {!archived && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          <div className="text-xs text-stone-600">手工登记兜底（文字回复 / 文件名不规范）</div>
          <div className="mt-1.5 flex gap-2">
            <input
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder={`mentors/${run.mentorDir}/xxx_第二轮审核清单_回复.md`}
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
              disabled={!canScanSubmit}
            />
            <button
              type="button"
              disabled={!canScanSubmit || !manualPath.trim() || busy}
              onClick={() => guard(() => onAction('submit-round2-reply', { manualRelPath: manualPath }))}
              className="shrink-0 rounded-lg border border-teal-600 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-50 disabled:opacity-40"
            >
              登记哈希
            </button>
          </div>
        </div>
      )}

      {/* Codex 最终吸收 */}
      {(archived || ev.replySelectionRound2?.manual) && (
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/50 p-3">
          <p className="text-xs font-semibold text-stone-700">Codex 最终吸收（不选包）</p>
          <blockquote className="mt-2 whitespace-pre-line rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-700">
            {ROUND2_ABSORB_TRIGGER}
            <button
              type="button"
              disabled={step?.status === 'done'}
              onClick={() => void navigator.clipboard.writeText(ROUND2_ABSORB_TRIGGER)}
              className="ml-2 rounded border border-stone-300 px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
            >
              复制
            </button>
          </blockquote>

          {!ev.codexSubmit && !ev.finalAbsorbConfirm && (
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={submitted} onChange={(e) => setSubmitted(e.target.checked)} className="mt-0.5" />
                <span>我已把最终吸收触发语粘贴进该导师的 Codex 专属对话并提交</span>
              </label>
              <input
                value={threadId}
                onChange={(e) => setThreadId(e.target.value)}
                placeholder="Codex 对话标识（选填）"
                className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                disabled={!canAbsorb || !submitted || busy}
                onClick={() => guard(() => onAction('confirm-round2-absorb', { submittedToConversation: true, codexThreadId: threadId || undefined }))}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
              >
                登记已提交
              </button>
            </div>
          )}

          {ev.codexSubmit && !ev.finalAbsorbConfirm && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-emerald-700">已登记提交（{new Date(ev.codexSubmit.at).toLocaleString('zh-CN')}）。Codex 完成更新后：</p>
              <label className="flex items-start gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={absorbDoneChecked} onChange={(e) => setAbsorbDoneChecked(e.target.checked)} className="mt-0.5" />
                <span>我已核对 Codex 已按第二轮回复完成 prompt 与知识卡更新（仅确认吸收完成，不代表允许集成）</span>
              </label>
              <button
                type="button"
                disabled={!canAbsorb || !absorbDoneChecked || busy}
                onClick={() => guard(() => onAction('confirm-round2-absorb', { absorbCompleted: true }))}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                确认最终吸收完成
              </button>
            </div>
          )}

          {ev.finalAbsorbConfirm && (
            <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
              最终吸收已确认（{new Date(ev.finalAbsorbConfirm.at).toLocaleString('zh-CN')}）。第二轮全链路到此收束；是否允许集成留待后续门禁。
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <ImpactNote>导师回复内容不得改写；最终吸收只登记证据，Final Handoff 包由后续步骤按不可变规则发现，本步不选包。</ImpactNote>
    </section>
  );
}

// ------------------------------------------------------------------
// P4a：S17-S20 Final Handoff 发现 + 九类预检 + pending 归零 + G4 第一次门禁
// 依据：D:\database\AGENTS.md §16-§18
// ------------------------------------------------------------------

type HandoffEvidence = {
  discovered?: {
    packagePath: string;
    version: string;
    coreFiles?: Array<{ name: string; relPath: string; exists: boolean; sha256: string | null; bytes: number | null }>;
    hashBaseline?: string[];
    missing?: string[];
    discoveredAt?: string;
  };
};

type PreflightEvidence = {
  preflight?: {
    results: Array<{
      key: string;
      label: string;
      status: 'pass' | 'fail' | 'warn' | 'pending';
      evidence: string;
      value: string | number | boolean | object | null;
      reason?: string;
      responsibleParty?: 'codex' | 'trae' | 'human' | 'control_plane';
    }>;
    allPass: boolean;
    pendingCount: { external: number; internal: number };
    checkedAt?: string;
  };
};

type PendingEvidence = {
  pendingCards?: Array<{ cardId: string; knowledgeClass: string; disclosureMode: string; round: number; blockingReason?: string }>;
  pendingDispositions?: Array<{ cardId: string; disposition: string; note?: string | null; at: string; by: string }>;
  allSettled?: boolean;
};

type G4Evidence = {
  g4Approval?: { by: string; at: string; button: string; handoffPath: string | null; handoffVersion: string | null; hashBaseline?: string[] };
  g4Reject?: { by: string; at: string; reason: string };
};

const HANDOFF_STATES = [
  'codex_final_absorb',
  'final_handoff_discovered',
  'final_handoff_preflight',
  'final_handoff_blocked',
  'ready_for_integration',
  'awaiting_staging_integration_approval',
  'reconciling_snapshots',
];

export function FinalHandoffDiscoverPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S17');
  const ev = (step?.evidence ?? {}) as HandoffEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const { busy, error, guard } = useGuard();
  const showPanel =
    HANDOFF_STATES.includes(run.status) || Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;
  const canDiscover = canWrite && !running && ['codex_final_absorb', 'final_handoff_discovered', 'final_handoff_blocked'].includes(run.status);
  const discovered = ev.discovered;
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S17 · Final Handoff 发现（最新有效不可变包）</h3>
      <p className="mt-1 text-xs text-stone-500">
        扫描导师 work 目录定位最新 <code>-final-handoff-v&lt;actual&gt;</code> 包；校验四件套（00_START_HERE.md / source_manifest_final.json / TRAE_HANDOFF.md / VALIDATION_REPORT.md）；哈希基线锁定防 Codex 归档后篡改。
      </p>
      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S17' })} />}
      <div className="mt-3">
        <button
          type="button"
          disabled={!canDiscover || busy}
          onClick={() => guard(() => onAction('discover-final-handoff', {}))}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {running ? '发现中…' : discovered ? '重新发现 Final Handoff' : '发现 Final Handoff'}
        </button>
      </div>
      {discovered && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-stone-700">
          <div className="font-medium text-emerald-800">已定位 Final Handoff 包</div>
          <div className="mt-1 break-all">路径：{discovered.packagePath}</div>
          <div>版本：{discovered.version}</div>
          {discovered.hashBaseline && discovered.hashBaseline.length > 0 && (
            <div className="mt-1">哈希基线（{discovered.hashBaseline.length} 项）：{discovered.hashBaseline.slice(0, 3).join('、')}{discovered.hashBaseline.length > 3 ? ' …' : ''}</div>
          )}
          {discovered.discoveredAt && <div className="mt-1 text-stone-500">发现时间：{new Date(discovered.discoveredAt).toLocaleString('zh-CN')}</div>}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

export function PreflightNineChecksPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S18');
  const ev = (step?.evidence ?? {}) as PreflightEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const { busy, error, guard } = useGuard();
  const showPanel =
    ['final_handoff_preflight', 'final_handoff_blocked', 'ready_for_integration', 'awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;
  const canCheck = canWrite && !running && ['final_handoff_preflight', 'final_handoff_blocked'].includes(run.status);
  const preflight = ev.preflight;
  const statusColor = (s: string) => s === 'pass' ? 'bg-emerald-100 text-emerald-700' : s === 'fail' ? 'bg-red-100 text-red-700' : s === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500';
  const statusIcon = (s: string) => s === 'pass' ? '✓' : s === 'fail' ? '✕' : s === 'warn' ? '⋯' : '–';
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S18 · Final Handoff 九类预检（AGENTS §16.4）</h3>
      <p className="mt-1 text-xs text-stone-500">
        逐项显示状态/证据路径/实际数值，不显示笼统「通过」。任一失败 → final_handoff_blocked。pending 卡不阻塞预检本身，但阻塞 G4 门禁。
      </p>
      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S18' })} />}
      <div className="mt-3">
        <button
          type="button"
          disabled={!canCheck || busy}
          onClick={() => guard(() => onAction('preflight', {}))}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {running ? '预检中…' : preflight ? '重新预检' : '发起九类预检'}
        </button>
      </div>
      {preflight && (
        <div className="mt-3 space-y-2">
          {preflight.results.map((r) => (
            <div key={r.key} className="rounded-lg border border-stone-200 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-[11px] font-medium ${statusColor(r.status)}`}>
                  {statusIcon(r.status)}
                </span>
                <span className="font-medium text-stone-800">{r.label}</span>
              </div>
              <div className="mt-1 text-stone-600">证据：{r.evidence}</div>
              <div className="text-stone-500">数值：{typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value ?? '—')}</div>
              {r.status === 'fail' && r.reason && <div className="mt-1 text-red-600">原因：{r.reason}</div>}
              {r.status === 'warn' && r.reason && <div className="mt-1 text-amber-600">提示：{r.reason}</div>}
              {r.status === 'fail' && r.responsibleParty && (
                <div className="mt-1 text-stone-500">责任方：{r.responsibleParty} · 建议「打开 Codex 对话/打开文件/请求重做」</div>
              )}
            </div>
          ))}
          <div className={`mt-2 rounded-lg p-2.5 text-xs font-medium ${preflight.allPass ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            {preflight.allPass ? `九类预检全过 · pending 卡 external=${preflight.pendingCount.external} / internal=${preflight.pendingCount.internal}` : '预检未通过，详见上方失败项'}
            {preflight.checkedAt && <span className="ml-2 font-normal text-stone-500">{new Date(preflight.checkedAt).toLocaleString('zh-CN')}</span>}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

export function PendingDispositionPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S19');
  const ev = (step?.evidence ?? {}) as PendingEvidence;
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const { busy, error, guard } = useGuard();
  const showPanel =
    ['ready_for_integration', 'awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;
  const pendingCards = ev.pendingCards ?? [];
  const scanDone = step?.commandStatus === 'done' && pendingCards.length === 0;
  const canScan = canWrite && !running && ['ready_for_integration', 'awaiting_staging_integration_approval'].includes(run.status) && !scanDone;
  const canSubmit = canWrite && !running && run.status === 'ready_for_integration';
  const dispositions = ev.pendingDispositions ?? [];
  const dispositionOf = (cardId: string) => dispositions.find((d) => d.cardId === cardId)?.disposition;
  const [localChoice, setLocalChoice] = useState<Record<string, 'external_approved_generalized' | 'external_approved_exact' | 'internal_approved_none' | 'exclude' | 'keep_pending' | ''>>({});
  const [localNote, setLocalNote] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const triggerText = '该导师的 Final Handoff 预检发现 pending 知识卡，请依据导师审核回复和现行治理规则逐张处置：转 external_approved+generalized/exact、转 internal_approved+none、从最终候选快照排除并记录，或保持 pending 阻塞。';
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-800">S19 · pending 归零处置（Codex 逐张，Trae 无升级权）</h3>
      <p className="mt-1 text-xs text-stone-500">
        目标状态 external_pending=0 且 internal_pending=0。每张 pending 卡由 Codex 依据导师审核回复和现行治理规则逐张处置为四种结果之一；Trae 不得自行把 pending 改为 approved。缺确认的卡保持 pending 阻塞集成。
      </p>
      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S19' })} />}
      <div className="mt-3">
        <button
          type="button"
          disabled={!canScan || busy}
          onClick={() => guard(() => onAction('list-pending-cards', {}))}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {running ? '扫描中…' : scanDone ? '已扫描完成 ✓' : pendingCards.length > 0 ? '重新扫描 pending 卡' : '扫描 pending 卡'}
        </button>
      </div>
      {pendingCards.length === 0 && step?.commandStatus === 'done' && (
        <p className="mt-2 text-xs text-emerald-700">无 pending 卡，可直接进入 G4 门禁。</p>
      )}
      {pendingCards.length > 0 && (
        <div className="mt-3 space-y-2">
          {pendingCards.map((c) => {
            const settled = dispositionOf(c.cardId);
            return (
              <div key={c.cardId} className="rounded-lg border border-stone-200 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-800">{c.cardId}</span>
                  <span className="text-stone-500">{c.knowledgeClass} / {c.disclosureMode} · 第 {c.round} 轮</span>
                </div>
                {c.blockingReason && <div className="mt-1 text-amber-700">阻塞原因：{c.blockingReason}</div>}
                {settled ? (
                  <div className="mt-1 text-emerald-700">已处置：{settled}</div>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(['external_approved_generalized', 'external_approved_exact', 'internal_approved_none', 'exclude', 'keep_pending'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={!canSubmit}
                          onClick={() => setLocalChoice((p) => ({ ...p, [c.cardId]: opt }))}
                          className={`rounded px-1.5 py-0.5 text-[11px] ${localChoice[c.cardId] === opt ? 'bg-teal-600 text-white' : 'border border-stone-300 text-stone-600'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    <input
                      value={localNote[c.cardId] ?? ''}
                      onChange={(e) => setLocalNote((p) => ({ ...p, [c.cardId]: e.target.value }))}
                      placeholder="处置依据（≥5 字）"
                      className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1 text-xs"
                      disabled={!canSubmit}
                    />
                    <button
                      type="button"
                      disabled={!canSubmit || !localChoice[c.cardId] || busy}
                      onClick={() => guard(() => onAction('submit-pending-disposition', { cardId: c.cardId, disposition: localChoice[c.cardId], note: localNote[c.cardId] }))}
                      className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      提交处置
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Codex 沟通区：复用 S11/S16 同构模板 */}
      <div className="mt-4 border-t border-stone-100 pt-3">
        <div className="text-xs font-medium text-stone-700">Codex 沟通区（复用 S11/S16 模板）</div>
        <div className="mt-1.5 rounded-lg bg-stone-50 p-2 text-xs text-stone-600">{triggerText}</div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(triggerText);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
          >
            {copied ? '已复制' : '复制触发语（人工粘贴）'}
          </button>
          <button
            type="button"
            disabled
            className="rounded-lg bg-stone-200 px-2 py-1 text-xs text-stone-400"
            title="needs_validation：Codex 驱动稳定前由人工粘贴触发语到该导师专属 Codex 对话"
          >
            由 Runner 投递（验证中）
          </button>
        </div>
      </div>

      {ev.allSettled && (
        <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          pending 卡已全部归零（external_pending=0 / internal_pending=0），状态进入 awaiting_staging_integration_approval，可继续 G4 门禁。
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

export function G4GatePanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S20');
  const s17 = run.steps.find((s) => s.code === 'S17');
  const s18 = run.steps.find((s) => s.code === 'S18');
  const ev = (step?.evidence ?? {}) as G4Evidence;
  const { busy, error, guard } = useGuard();
  const showPanel =
    ['awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;
  const handoffEv = (s17?.evidence ?? {}) as HandoffEvidence;
  const preflightEv = (s18?.evidence ?? {}) as PreflightEvidence;
  const pendingTotal = (preflightEv.preflight?.pendingCount.external ?? 0) + (preflightEv.preflight?.pendingCount.internal ?? 0);
  const [checks, setChecks] = useState({ preflightAllPassed: false, pendingAllZeroed: false, handoffVersionAndHashRecorded: false, readNoMasterProduction: false });
  const [rejectReason, setRejectReason] = useState('');
  const allChecked = checks.preflightAllPassed && checks.pendingAllZeroed && checks.handoffVersionAndHashRecorded && checks.readNoMasterProduction;
  const canApprove = canWrite && run.status === 'awaiting_staging_integration_approval' && allChecked;
  const canReject = canWrite && ['awaiting_staging_integration_approval', 'reconciling_snapshots'].includes(run.status);
  return (
    <section className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-4 shadow-sm">
      <h3 className="text-sm font-bold text-stone-800">S20 · G4 第一次人工确认：确认交给Trae集成至main和测试端</h3>
      <p className="mt-1 text-xs text-stone-500">
        本按钮只授权应用集成、推送 main、部署/更新测试端；不授权推送 master 或部署生产。通过后 S21 Trae 集成六段由 Runner 全自动串联执行。
      </p>
      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => onAction('retry-command', { stepCode: 'S20' })} />}

      {/* 就绪信息摘要 */}
      <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-xs">
        <div className="font-medium text-stone-800">Final Handoff 就绪信息</div>
        <div className="mt-1 space-y-0.5 text-stone-600">
          <div>包路径：{handoffEv.discovered?.packagePath ?? '—'}</div>
          <div>版本：{handoffEv.discovered?.version ?? '—'}</div>
          <div>预检全过：{preflightEv.preflight?.allPass ? '是' : '否'}</div>
          <div>pending 卡：external={preflightEv.preflight?.pendingCount.external ?? 0} / internal={preflightEv.preflight?.pendingCount.internal ?? 0}（合计 {pendingTotal}）</div>
          {handoffEv.discovered?.hashBaseline && handoffEv.discovered.hashBaseline.length > 0 && (
            <div>哈希基线：{handoffEv.discovered.hashBaseline.length} 项已锁定</div>
          )}
        </div>
      </div>

      {/* 证据核对勾 */}
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="font-medium text-stone-700">证据核对勾（全部勾选后按钮才可点）</div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={checks.preflightAllPassed} onChange={(e) => setChecks((p) => ({ ...p, preflightAllPassed: e.target.checked }))} disabled={!canWrite} />
          <span>S18 九类预检已全部通过</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={checks.pendingAllZeroed} onChange={(e) => setChecks((p) => ({ ...p, pendingAllZeroed: e.target.checked }))} disabled={!canWrite} />
          <span>S19 pending 卡已全部归零（external_pending=0 / internal_pending=0）</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={checks.handoffVersionAndHashRecorded} onChange={(e) => setChecks((p) => ({ ...p, handoffVersionAndHashRecorded: e.target.checked }))} disabled={!canWrite} />
          <span>Final Handoff 版本与全量哈希已记录</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={checks.readNoMasterProduction} onChange={(e) => setChecks((p) => ({ ...p, readNoMasterProduction: e.target.checked }))} disabled={!canWrite} />
          <span>已读「本次操作不会触碰 master 或生产环境」声明</span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canApprove || busy}
          onClick={() => guard(() => onAction('g4-approve', { evidenceChecks: checks }))}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          确认交给Trae集成至main和测试端
        </button>
        <ImpactNote>只授权应用集成、推送 main、部署/更新测试端；不授权推送 master 或部署生产。</ImpactNote>
      </div>

      {/* 驳回入口 */}
      {canReject && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          <div className="text-xs text-stone-600">驳回 G4（回退到 final_handoff_preflight 重做预检，原因 ≥5 字）</div>
          <div className="mt-1.5 flex gap-2">
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="驳回原因"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
              disabled={!canWrite}
            />
            <button
              type="button"
              disabled={!canWrite || rejectReason.trim().length < 5 || busy}
              onClick={() => guard(() => onAction('g4-reject', { reason: rejectReason }))}
              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100 disabled:opacity-40"
            >
              驳回 G4
            </button>
          </div>
        </div>
      )}

      {ev.g4Approval && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          G4 已通过（{new Date(ev.g4Approval.at).toLocaleString('zh-CN')}）· Final Handoff 版本 {ev.g4Approval.handoffVersion ?? '—'} · 状态进入 reconciling_snapshots，S21 集成已自动启动。
        </p>
      )}
      {ev.g4Reject && (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          G4 已驳回（{new Date(ev.g4Reject.at).toLocaleString('zh-CN')}）· 原因：{ev.g4Reject.reason}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

// ------------------------------------------------------------------
// P4b：S21 Trae 集成面板（六段自动串联） + S22 生产发布面板（G5 门禁 + 四段自动）
// ------------------------------------------------------------------

type S21Evidence = {
  s21Progress?: Record<string, { ok: boolean; at: string; summary?: unknown }>;
  handoffPath?: string | null;
  handoffVersion?: string | null;
};

type S22Evidence = {
  g5Approval?: { by: string; at: string; button: string; lockedMainSha: string | null };
  g5Reject?: { by: string; at: string; reason: string };
  s22Progress?: Record<string, { ok: boolean; at: string; summary?: unknown }>;
  lockedMainSha?: string | null;
};

const S21_ACTIVE_STATES = [
  'reconciling_snapshots',
  'integration_backup_created',
  'integrating_application',
  'testing_staging',
  'pushing_main',
  'deploying_staging',
  'awaiting_staging_acceptance',
];

export function S21IntegrationPanel({
  run,
  canWrite,
}: {
  run: RunDetail;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S21');
  const showPanel =
    S21_ACTIVE_STATES.includes(run.status) || Boolean(step && step.status !== 'pending');
  if (!showPanel) return null;
  const ev = (step?.evidence ?? {}) as S21Evidence;
  const progress = ev.s21Progress ?? {};
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const stepDone = step?.status === 'done';

  // 当前段：S21_PHASES 中第一个未完成的段
  const currentPhaseIdx = S21_PHASES.findIndex((p) => !progress[p.code]);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-stone-800">S21 · Trae 集成：对账→备份→集成→激活导师→八类测试→推 main→部署测试端</h3>
      <p className="mt-1 text-xs text-stone-500">
        G4 通过后 Runner 全自动串联七段（无 pilot 激活配置的导师自动跳过激活段）；每段结果由控制平面记录，无需人工干预。
      </p>
      {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => {}} />}

      <div className="mt-3 space-y-1.5">
        {S21_PHASES.map((phase, idx) => {
          const p = progress[phase.code];
          const isCurrent = idx === currentPhaseIdx && !stepDone;
          const isDone = Boolean(p);
          const isFailed = step?.status === 'failed' && isCurrent;
          return (
            <div
              key={phase.code}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                isFailed
                  ? 'border-red-300 bg-red-50/50'
                  : isCurrent
                    ? 'border-blue-300 bg-blue-50/50'
                    : isDone
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-stone-200 bg-stone-50/30'
              }`}
            >
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                isFailed ? 'bg-red-200 text-red-800' : isCurrent ? 'bg-blue-200 text-blue-800' : isDone ? 'bg-emerald-200 text-emerald-800' : 'bg-stone-200 text-stone-500'
              }`}>
                {idx + 1}
              </span>
              <span className="flex-1 text-stone-700">{phase.label}</span>
              {isDone && p && (
                <span className="text-emerald-600">✓ {new Date(p.at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              )}
              {isCurrent && !isFailed && (
                <span className="text-blue-600">{running ? '执行中…' : '等待 Runner 接单…'}</span>
              )}
              {isFailed && <span className="text-red-600">失败</span>}
            </div>
          );
        })}
      </div>

      {stepDone && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          S21 集成完成。测试端已部署，等待人工验收（G5）。
        </p>
      )}
      {step?.failureReason && (
        <p className="mt-2 text-xs text-red-600">{step.failureReason}</p>
      )}
    </section>
  );
}

export function S22ProductionPanel({
  run,
  onAction,
  canWrite,
}: {
  run: RunDetail;
  onAction: ActionFn;
  canWrite: boolean;
}) {
  const step = run.steps.find((s) => s.code === 'S22');
  const ev = (step?.evidence ?? {}) as S22Evidence;
  const { busy, error, guard } = useGuard();
  const showGate =
    run.status === 'awaiting_staging_acceptance' || run.status === 'production_failed_rolled_back';
  const showProgress =
    ['production_approval_granted', 'locking_accepted_main_sha', 'promoting_main_to_master', 'deploying_production', 'verifying_production', 'completed'].includes(run.status) ||
    Boolean(step && step.status !== 'pending');

  const [checks, setChecks] = useState({ stagingAcceptancePassed: false, readProductionImpact: false, mainShaLocked: false, readRollbackPlan: false });
  const [rejectReason, setRejectReason] = useState('');
  const allChecked = checks.stagingAcceptancePassed && checks.readProductionImpact && checks.mainShaLocked && checks.readRollbackPlan;
  const canApprove = canWrite && run.status === 'awaiting_staging_acceptance' && allChecked;
  const canReject = canWrite && ['awaiting_staging_acceptance', 'production_approval_granted', 'promoting_main_to_master', 'deploying_production', 'verifying_production', 'production_failed_rolled_back'].includes(run.status);

  if (!showGate && !showProgress && !ev.g5Approval && !ev.g5Reject) return null;

  const progress = ev.s22Progress ?? {};
  const running = step?.commandStatus === 'queued' || step?.commandStatus === 'dispatched';
  const stepDone = step?.status === 'done';

  return (
    <section className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-4 shadow-sm">
      <h3 className="text-sm font-bold text-stone-800">S22 · 测试端验收 + 验收通过并发布生产（main → master → aihr.top）（G5）</h3>
      <p className="mt-1 text-xs text-stone-500">{G5_PRODUCTION_APPROVAL_SCOPE}</p>

      {/* G5 门禁区 */}
      {showGate && (
        <>
          {step && <StepCommandLine step={step} canWrite={canWrite} onRetry={() => {}} />}
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="font-medium text-stone-700">证据核对勾（全部勾选后按钮才可点）</div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={checks.stagingAcceptancePassed} onChange={(e) => setChecks((p) => ({ ...p, stagingAcceptancePassed: e.target.checked }))} disabled={!canWrite} />
              <span>测试端验收通过</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={checks.readProductionImpact} onChange={(e) => setChecks((p) => ({ ...p, readProductionImpact: e.target.checked }))} disabled={!canWrite} />
              <span>已读生产发布影响（推送 master + 部署 ECS）</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={checks.mainShaLocked} onChange={(e) => setChecks((p) => ({ ...p, mainShaLocked: e.target.checked }))} disabled={!canWrite} />
              <span>main SHA 已锁定（S21 push_main 段记录）</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={checks.readRollbackPlan} onChange={(e) => setChecks((p) => ({ ...p, readRollbackPlan: e.target.checked }))} disabled={!canWrite} />
              <span>已读回滚预案（PRODUCTION_FAILED_ROLLED_BACK 可回退）</span>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canApprove || busy}
              onClick={() => guard(() => onAction('g5-approve', { evidenceChecks: checks }))}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
            >
              {G5_PRODUCTION_APPROVAL_BUTTON}
            </button>
            <ImpactNote>{G5_PRODUCTION_APPROVAL_SCOPE}</ImpactNote>
          </div>
          {canReject && (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <div className="text-xs text-stone-600">驳回 G5（回退，原因 ≥5 字）</div>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="驳回原因"
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                  disabled={!canWrite}
                />
                <button
                  type="button"
                  disabled={!canWrite || rejectReason.trim().length < 5 || busy}
                  onClick={() => guard(() => onAction('g5-reject', { reason: rejectReason }))}
                  className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100 disabled:opacity-40"
                >
                  驳回 G5
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 四段进度 */}
      {showProgress && (
        <div className="mt-3 space-y-1.5">
          <div className="font-medium text-stone-700 text-xs">生产发布进度</div>
          {S22_PHASES.map((phase, idx) => {
            const p = progress[phase.code];
            const isCurrent = !p && !stepDone && S22_PHASES.findIndex((ph) => !progress[ph.code]) === idx;
            const isDone = Boolean(p);
            const isFailed = step?.status === 'failed' && isCurrent;
            return (
              <div
                key={phase.code}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  isFailed
                    ? 'border-red-300 bg-red-50/50'
                    : isCurrent
                      ? 'border-blue-300 bg-blue-50/50'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50/30'
                        : 'border-stone-200 bg-stone-50/30'
                }`}
              >
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isFailed ? 'bg-red-200 text-red-800' : isCurrent ? 'bg-blue-200 text-blue-800' : isDone ? 'bg-emerald-200 text-emerald-800' : 'bg-stone-200 text-stone-500'
                }`}>
                  {idx + 1}
                </span>
                <span className="flex-1 text-stone-700">{phase.label}</span>
                {isDone && p && (
                  <span className="text-emerald-600">✓ {new Date(p.at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                )}
                {isCurrent && !isFailed && (
                  <span className="text-blue-600">{running ? '执行中…' : '等待 Runner 接单…'}</span>
                )}
                {isFailed && <span className="text-red-600">失败</span>}
              </div>
            );
          })}
        </div>
      )}

      {ev.g5Approval && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          G5 已通过（{new Date(ev.g5Approval.at).toLocaleString('zh-CN')}）· 锁定 main SHA：{ev.g5Approval.lockedMainSha ?? '—'}
        </p>
      )}
      {ev.g5Reject && (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          G5 已驳回（{new Date(ev.g5Reject.at).toLocaleString('zh-CN')}）· 原因：{ev.g5Reject.reason}
        </p>
      )}
      {stepDone && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          生产发布完成。Run 已结束。
        </p>
      )}
      {step?.failureReason && <p className="mt-2 text-xs text-red-600">{step.failureReason}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
