'use client';

/**
 * 「🦞 新建导师龙虾 Run」三步向导（§5 Q13/Q14）：
 * 1 选导师（Runner 心跳目录候选，点选或手填；名字规则在后端校验）
 * 2 确认飞书群（群名唯一确认是硬挡；群 ID 选填）
 * 3 环境检查（不通过不硬挡，允许挂 waiting_runner；试点 Run 显式勾选）
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RunnerInfo } from './types';

const DIR_STATUS_HINT: Record<string, string> = {
  ok: '导师目录',
  template: '模板目录（不可选）',
  ignored: '已忽略（aaaa bbb 命名）',
  readonly: '只读区（不可选）',
};

export function CreateRunWizard({
  runners,
  onClose,
}: {
  runners: RunnerInfo[];
  onClose: () => void;
}) {
  const router = useRouter();
  const onlineRunner = runners.find((r) => r.online) ?? null;
  const [step, setStep] = useState(1);
  const [mentorDir, setMentorDir] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [chatName, setChatName] = useState('');
  const [chatId, setChatId] = useState('');
  const [chatConfirmed, setChatConfirmed] = useState(false);
  const [isPilot, setIsPilot] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const okDirs = useMemo(
    () => (onlineRunner?.dirs ?? []).filter((d) => d.status === 'ok'),
    [onlineRunner],
  );
  const otherDirs = useMemo(
    () => (onlineRunner?.dirs ?? []).filter((d) => d.status !== 'ok'),
    [onlineRunner],
  );

  const mentorValid = /^[A-Za-z][A-Za-z ._-]{0,99}$/.test(mentorDir.trim()) && !mentorDir.includes('  ');
  const endpoints = onlineRunner?.probes?.endpoints ?? null;
  const envChip = (label: string, ok: boolean | undefined) => (
    <span
      key={label}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {label}
      {ok === undefined ? '–' : ok ? '●' : '○'}
    </span>
  );

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/content-ops/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mentorDir: mentorDir.trim(),
          feishuChatName: chatName.trim(),
          feishuChatId: chatId.trim() || undefined,
          isPilot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `创建失败（${res.status}）`);
        setSubmitting(false);
        return;
      }
      onClose();
      router.push(`/content-ops/runs/${data.id}`);
    } catch {
      setError('网络错误，请重试');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="letter-paper w-full max-w-xl rounded-[20px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-ink">🦞 新建导师龙虾 Run</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600" aria-label="关闭">
            ✕
          </button>
        </div>

        {/* 步骤指示 */}
        <ol className="mb-5 flex items-center gap-2 text-xs text-stone-500">
          {['选导师', '确认飞书群', '环境检查'].map((name, i) => {
            const n = i + 1;
            const active = step === n;
            const passed = step > n;
            return (
              <li key={name} className="flex items-center gap-2">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    active
                      ? 'bg-accent text-white'
                      : passed
                        ? 'bg-emerald-500 text-white'
                        : 'bg-stone-200 text-stone-500'
                  }`}
                >
                  {passed ? '✓' : n}
                </span>
                <span className={active ? 'font-semibold text-stone-800' : ''}>{name}</span>
                {n < 3 && <span className="text-stone-300">—</span>}
              </li>
            );
          })}
        </ol>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
        )}

        {/* 第一步：选导师 */}
        {step === 1 && (
          <div className="space-y-3">
            {onlineRunner ? (
              <>
                <p className="text-sm text-stone-600">
                  Runner「{onlineRunner.name}」心跳上报的导师目录（CONTENT_ROOT={onlineRunner.contentRoot ?? '—'}）：
                </p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-stone-200 p-2">
                  {okDirs.length === 0 && (
                    <p className="px-2 py-3 text-xs text-stone-400">心跳中没有状态正常的导师目录</p>
                  )}
                  {okDirs.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      onClick={() => {
                        setMentorDir(d.name);
                        setManualMode(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                        mentorDir === d.name && !manualMode
                          ? 'bg-accent/10 ring-1 ring-accent'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <span className="font-medium text-stone-800">{d.name}</span>
                      <span className="text-xs text-stone-400">{DIR_STATUS_HINT[d.status]}</span>
                    </button>
                  ))}
                  {otherDirs.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-stone-400"
                    >
                      <span>{d.name}</span>
                      <span className="text-xs">{DIR_STATUS_HINT[d.status] ?? d.status}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="text-xs text-accent underline underline-offset-2"
                >
                  目录不在列表中？手动输入（心跳可能滞后）
                </button>
              </>
            ) : (
              <div className="space-y-2 rounded-xl bg-stone-50 p-4 text-sm text-stone-600">
                <p>Runner 当前离线，读不到导师目录列表。可以先手动填写目录名，Run 会挂在「等待 Runner 接上」。</p>
                <p className="text-xs text-stone-400">名称须与 D:\database\mentors 下的英文目录一致（不区分大小写）。</p>
              </div>
            )}
            {(manualMode || !onlineRunner) && (
              <input
                value={mentorDir}
                onChange={(e) => setMentorDir(e.target.value)}
                placeholder="例如 lydia chen pilot"
                className="input-field"
                autoFocus
              />
            )}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!mentorValid}
                onClick={() => setStep(2)}
                className="btn-primary"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* 第二步：飞书群 */}
        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">飞书内容工作群名称（必填）</label>
              <input
                value={chatName}
                onChange={(e) => setChatName(e.target.value)}
                placeholder={`例如：${mentorDir} 导师内容群`}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">群 ID / 聊天链接（选填）</label>
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                className="input-field"
              />
            </div>
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              <input
                type="checkbox"
                checked={chatConfirmed}
                onChange={(e) => setChatConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                我确认该群与导师「{mentorDir}」唯一对应：不存在第二个内容工作群，群名与群成员已人工核对。
                群身份无法唯一确认时不能建 Run（硬挡）。
              </span>
            </label>
            <div className="flex justify-between">
              <button type="button" onClick={() => setStep(1)} className="text-sm text-stone-500">
                上一步
              </button>
              <button
                type="button"
                disabled={!chatName.trim() || !chatConfirmed}
                onClick={() => setStep(3)}
                className="btn-primary"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* 第三步：环境检查 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-stone-200 p-4">
              <p className="mb-2 text-sm font-medium text-ink">Runner 与连通性</p>
              {onlineRunner ? (
                <div className="space-y-2">
                  <p className="text-sm text-emerald-700">● Runner 在线：{onlineRunner.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {endpoints && (
                      <>
                        {envChip('国内参照', endpoints.cnBase?.reachable)}
                        {envChip('飞书', endpoints.feishu?.reachable)}
                        {envChip('Claude', endpoints.claude?.reachable)}
                        {envChip('Codex', endpoints.codex?.reachable)}
                        {envChip('GitHub', endpoints.github?.reachable)}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-stone-600">
                  Runner 离线：Run 可以先建，状态为「等待 Runner 接上」；请去 Windows 启动 Runner，首次心跳到达后自动继续。
                </p>
              )}
            </div>
            <label className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-700">
              <input
                type="checkbox"
                checked={isPilot}
                onChange={(e) => setIsPilot(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                这是试点 Run（P1）。试点使用导师目录副本跑通 S0-S7，验收后由人工删除副本，不触碰真实导师目录。
              </span>
            </label>
            <div className="flex justify-between">
              <button type="button" onClick={() => setStep(2)} className="text-sm text-stone-500">
                上一步
              </button>
              <button type="button" onClick={submit} disabled={submitting} className="btn-primary">
                {submitting ? '创建中...' : '创建 Run'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
