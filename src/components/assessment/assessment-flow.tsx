'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  QUESTIONS,
  QUESTIONS_PER_DIM,
  QUESTION_VERSION,
  DIMENSIONS,
  DIMENSION_META,
  type Dimension,
  type RiasecQuestion,
} from '@/lib/riasec/questions';
import { sampleBalanced } from '@/lib/riasec/shuffle';
import { scoreAnswers, type AnswerItem, type ScoreResult } from '@/lib/riasec/score';
import { savePendingAssessment } from '@/lib/riasec/storage';

type Stage = 'intro1' | 'intro2' | 'test' | 'result';

const RATING_LABELS = ['非常不想做', '不太想做', '一般，没有明显偏好', '比较想做', '非常想做'];
// 五档情绪表情：吐 → 皱眉 → 微笑 → 好的 → 哇
const RATING_EMOJI = ['🤢', '😕', '🙂', '😊', '🤩'];
// 结果条形图配色，按名次循环
const BAR_COLORS = [
  'bg-brand-500',
  'bg-sage-500',
  'bg-gold-400',
  'bg-coral-500',
  'bg-sand-500',
  'bg-muted',
];

export function AssessmentFlow() {
  const router = useRouter();
  const { status } = useSession();

  const [stage, setStage] = useState<Stage>('intro1');
  // 每次从 60 题池六维各随机抽 5 题组卷（共 30 题），再维度均衡打乱
  const buildOrder = () => sampleBalanced(QUESTIONS, QUESTIONS_PER_DIM, (q) => q.dim);
  const [order, setOrder] = useState<RiasecQuestion[]>(buildOrder);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [guestDialog, setGuestDialog] = useState(false);
  // 解释生成：保存后调 LLM 生成兴趣代码解读
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [explainJobs, setExplainJobs] = useState<
    { jobCn: string; industry: string; entryPath: string }[]
  >([]);
  const [explainError, setExplainError] = useState('');
  const [explainProgress, setExplainProgress] = useState(0);
  // 已有测评结果（从档案加载，用于直接展示而非重新答题）
  const [existingResult, setExistingResult] = useState<ScoreResult | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 「第 i / 30 题」进度条：切题时把它定位到吸顶导航正下方
  const progressRef = useRef<HTMLDivElement | null>(null);

  // 切换阶段滚动到顶部；答题阶段切题时定位到进度条（第 i/30 题）上方
  useEffect(() => {
    if (stage === 'test' && progressRef.current) {
      const nav = document.querySelector('nav.glass-nav') as HTMLElement | null;
      const navH = nav?.offsetHeight ?? (window.innerWidth >= 768 ? 56 : 89);
      const rect = progressRef.current.getBoundingClientRect();
      const top = Math.max(0, window.scrollY + rect.top - navH - 8);
      window.scrollTo({ top, behavior: 'auto' });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [stage, idx]);

  // 挂载时检查是否已有测评结果：有则直接展示结果+解读，不再引导重新答题
  // 但若用户刚点过"重新测一次"（sessionStorage 标记），则进入引导页，不加载旧结果
  useEffect(() => {
    let cancelled = false;
    // 用户主动重测：跳过旧结果加载，停留在引导页
    if (sessionStorage.getItem('assessment_retake') === '1') {
      sessionStorage.removeItem('assessment_retake');
      setLoadingExisting(false);
      return;
    }
    fetch('/api/user/profile', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { assessment?: { scores?: Record<Dimension, number>; code?: string | null; explanation?: string | null; recommendedJobs?: string | null } | null }) => {
        if (cancelled) return;
        const a = data.assessment;
        if (a && a.scores && a.code) {
          setExistingResult({ scores: a.scores, code: a.code });
          setSaved(true); // 已保存过，不再显示保存按钮
          if (a.explanation) {
            setExplanation(a.explanation);
          }
          // 加载已存的推荐探索方向
          if (a.recommendedJobs) {
            try {
              const jobs = JSON.parse(a.recommendedJobs);
              if (Array.isArray(jobs)) {
                setExplainJobs(jobs.map((jobCn: string) => ({ jobCn, industry: '', entryPath: '' })));
              }
            } catch { /* ignore */ }
          }
          if (!a.explanation) {
            // 老用户没有解读，自动生成一次（结果存库）
            generateExplanation(a.code, a.scores);
          }
          setStage('result');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 展示用的结果：当前答题算出的，或从档案加载的已有结果

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === order.length;

  const result = useMemo(() => {
    if (stage !== 'result') return null;
    const items: AnswerItem[] = order
      .map((q) => ({ qid: q.id, value: answers[q.id] }))
      .filter((a) => typeof a.value === 'number');
    // 本次访问未答题（从档案加载已有结果跳到 result 阶段）：返回 null 让 displayResult fallback 到 existingResult
    if (items.length === 0) return null;
    return scoreAnswers(order, items);
  }, [stage, order, answers]);

  // 展示用的结果：当前答题算出的，或从档案加载的已有结果
  const displayResult = result ?? existingResult;

  const payload = useMemo(() => {
    if (!result) return null;
    const items: AnswerItem[] = order
      .map((q) => ({ qid: q.id, value: answers[q.id] }))
      .filter((a) => typeof a.value === 'number');
    return {
      scores: result.scores,
      answers: items,
      questionVersion: QUESTION_VERSION,
      code: result.code,
      takenAt: new Date().toISOString(),
    };
  }, [result, order, answers]);

  const restart = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setOrder(buildOrder());
    setAnswers({});
    setIdx(0);
    setSaved(false);
    setSaveError('');
    setRetryCount(0);
    setGuestDialog(false);
    setExplanation('');
    setExplainJobs([]);
    setExplainError('');
    setExplainProgress(0);
    setExistingResult(null);
    // 标记用户主动重测：再次进入本页时不再自动展示旧结果
    sessionStorage.setItem('assessment_retake', '1');
    setStage('intro1');
  };

  const choose = (value: number) => {
    const q = order[idx];
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    if (idx < order.length - 1) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      // 短暂延迟让用户看到选中反馈，然后立即切到下一题（无选中状态）
      advanceTimer.current = setTimeout(() => setIdx((i) => i + 1), 120);
    }
  };

  const handleSave = async () => {
    if (!payload || saving) return;
    setSaveError('');

    if (status !== 'authenticated') {
      setGuestDialog(true);
      return;
    }

    setSaving(true);
    try {
      const body = JSON.stringify(payload);
      // 冷启动/网络抖动时首请求可能失败；服务端按 userId 幂等覆盖，重试不会产生重复数据
      const MAX_RETRIES = 2;
      let attempt = 0;
      for (;;) {
        let res: Response;
        try {
          res = await fetch('/api/assessment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
        } catch {
          // 网络层失败（断网/连接重置/冷启动超时）：退避后重试
          if (attempt < MAX_RETRIES) {
            setRetryCount(attempt + 1);
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            attempt += 1;
            continue;
          }
          throw new Error('网络不太通，结果没存上，请再点一次');
        }

        // 客户端会话状态过期（如 cookie 失效）时，回退到访客注册引导
        if (res.status === 401 || res.status === 403) {
          setGuestDialog(true);
          return;
        }
        // 服务端瞬时错误（冷启动 5xx / 限流 429）：同样退避重试
        if (
          !res.ok &&
          (res.status === 408 || res.status === 429 || res.status >= 500) &&
          attempt < MAX_RETRIES
        ) {
          setRetryCount(attempt + 1);
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          attempt += 1;
          continue;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '保存失败');
        }
        break;
      }
      setSaved(true);
      // 保存成功后，异步生成兴趣代码解读（不阻塞"查看我的档案"按钮出现）
      if (payload) {
        generateExplanation(payload.code, payload.scores);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
      setRetryCount(0);
    }
  };

  const goRegisterWithResult = () => {
    if (payload) savePendingAssessment(payload);
    router.push('/register-v2');
  };

  // 调用 LLM 生成兴趣代码解读，带进度条动画
  const generateExplanation = async (code: string, scores: Record<string, number>) => {
    setExplaining(true);
    setExplainError('');
    setExplanation('');
    setExplainJobs([]);
    setExplainProgress(0);

    // 进度条：0→85% 用定时递增模拟加载，真实完成时跳到100%
    let progress = 0;
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 12 + 3, 88);
      setExplainProgress(progress);
    }, 350);

    try {
      const res = await fetch('/api/assessment/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, scores }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '解读生成失败');
      }
      const data = await res.json();
      setExplanation(data.explanation || '');
      setExplainJobs(data.jobs || []);
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : '解读生成失败，请稍后查看档案页');
    } finally {
      clearInterval(progressTimer);
      setExplainProgress(100);
      setExplaining(false);
    }
  };

  return (
    <main className="relative z-10 flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:py-12">
        {stage === 'intro1' && (
          <section className="letter-paper rounded-2xl p-6 md:p-8">
            <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-[11px] font-medium text-brand-700">
              霍兰德 RIASEC · 30 题试用版
            </span>
            <h1 className="mt-4 font-serif text-2xl font-black text-ink md:text-3xl">
              职业兴趣测试
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted">
              发现你的职业兴趣，看看哪些工作活动天然对你胃口。结果会生成你的六维兴趣画像，并用于匹配合适的职业方向和导师分身。
            </p>

            <div className="mt-6 space-y-4">
              {[
                '想象下面这些活动是你工作的一部分，按你的喜欢程度作答',
                '看到六个维度的兴趣画像：实用型、研究型、艺术型、社会型、企业型、常规型',
                '带着兴趣结果，去探索匹配的职业方向和导师分身',
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-6 text-ink/90">{text}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 rounded-xl bg-beige/70 px-4 py-3 text-xs leading-6 text-muted">
              答案没有对错好坏，按真实想法作答即可，以后也可以随时重测。
            </p>

            <button
              onClick={() => setStage('intro2')}
              className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[.98]"
            >
              下一步
            </button>
          </section>
        )}

        {stage === 'intro2' && (
          <section className="letter-paper rounded-2xl p-6 md:p-8">
            <h1 className="font-serif text-2xl font-black text-ink md:text-3xl">怎么作答</h1>
            <p className="mt-3 text-sm leading-7 text-muted">
              每道题描述一种工作活动，暂时不考虑会不会、要学多久，只看你有多想做，从下面五档心情中选一个：
            </p>

            <div className="mt-5 grid grid-cols-5 gap-2">
              {RATING_LABELS.map((label, i) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-xl border border-rule/50 bg-bg/60 px-1 py-3"
                >
                  <span className="text-2xl leading-none" aria-hidden>
                    {RATING_EMOJI[i]}
                  </span>
                  <span className="text-[11px] leading-tight text-muted">{label}</span>
                </div>
              ))}
            </div>

            <ul className="mt-6 space-y-2.5 text-sm leading-6 text-ink/90">
              <li className="flex gap-2">
                <span className="text-sage-500">·</span>
                按“想不想做”作答，不用考虑自己会不会、有没有学过
              </li>
              <li className="flex gap-2">
                <span className="text-sage-500">·</span>
                凭第一反应选择，不必反复斟酌
              </li>
              <li className="flex gap-2">
                <span className="text-sage-500">·</span>
                答题中随时可以点“上一题”修改答案
              </li>
            </ul>

            <div className="mt-7 flex gap-3">
              <button
                onClick={() => setStage('intro1')}
                className="rounded-xl border border-rule bg-white px-5 py-3 text-sm font-medium text-muted transition-all hover:bg-bg"
              >
                上一页
              </button>
              <button
                onClick={() => setStage('test')}
                className="flex flex-1 items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[.98]"
              >
                开始测试
              </button>
            </div>
          </section>
        )}

        {stage === 'test' && (
          <section>
            {/* 进度 */}
            <div ref={progressRef} className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>
                  第 {idx + 1} / {order.length} 题
                </span>
                <span>已作答 {answeredCount}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule/50">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-200"
                  style={{ width: `${(answeredCount / order.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="letter-paper rounded-2xl p-6 md:p-8">
              <p className="font-serif text-lg font-bold leading-8 text-ink md:text-xl">
                我愿意/喜欢做这样的事：
              </p>
              <p className="mt-3 text-lg font-bold leading-8 text-ink">
                {order[idx].text}
              </p>

              <div className="mt-7 space-y-2.5">
                {RATING_LABELS.map((label, i) => {
                  const value = i + 1;
                  const selected = answers[order[idx].id] === value;
                  return (
                    <button
                      key={`${order[idx].id}-${i}`}
                      onClick={() => choose(value)}
                      aria-pressed={selected}
                      className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all active:scale-[.99] ${
                        selected
                          ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                          : 'border-rule/60 bg-white text-ink/80 hover:border-brand-300 hover:bg-brand-50/50'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl leading-none transition-all duration-150 ${
                          selected
                            ? 'scale-110 bg-brand-100'
                            : 'bg-bg/70 opacity-60 group-hover:opacity-90'
                        }`}
                      >
                        {RATING_EMOJI[i]}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
                className="rounded-xl border border-rule bg-white px-5 py-2.5 text-sm font-medium text-muted transition-all hover:bg-bg disabled:opacity-40"
              >
                上一题
              </button>
              {idx === order.length - 1 ? (
                <button
                  onClick={() => allAnswered && setStage('result')}
                  disabled={!allAnswered}
                  className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-600 disabled:opacity-40"
                >
                  查看结果
                </button>
              ) : (
                <button
                  onClick={() => answers[order[idx].id] && setIdx((i) => i + 1)}
                  disabled={!answers[order[idx].id]}
                  className="rounded-xl border border-rule bg-white px-5 py-2.5 text-sm font-medium text-muted transition-all hover:bg-bg disabled:opacity-40"
                >
                  下一题
                </button>
              )}
            </div>
            {idx === order.length - 1 && !allAnswered && (
              <p className="mt-2 text-right text-xs text-coral-600">
                还有 {order.length - answeredCount} 题未作答
              </p>
            )}
          </section>
        )}

        {stage === 'result' && displayResult && (
          <section>
            <div className="letter-paper rounded-2xl p-6 md:p-8">
              <h1 className="font-serif text-2xl font-black text-ink md:text-3xl">
                你的兴趣画像
              </h1>

              {/* 主码 */}
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-beige/70 px-5 py-4">
                <span className="shrink-0 text-xs text-muted">兴趣代码</span>
                <span className="flex shrink-0 gap-1.5">
                  {displayResult.code.split('').map((d, i) => (
                    <span
                      key={d}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-base font-black text-white ${BAR_COLORS[i]}`}
                    >
                      {d}
                    </span>
                  ))}
                </span>
                <span className="w-full text-sm font-semibold leading-6 text-ink sm:w-auto sm:shrink-0">
                  {displayResult.code
                    .split('')
                    .map((d) => DIMENSION_META[d as Dimension].name)
                    .join(' · ')}
                </span>
              </div>

              {/* 六维条形图 */}
              <div className="mt-6 space-y-4">
                {DIMENSIONS.slice()
                  .sort(
                    (a, b) =>
                      displayResult.scores[b] - displayResult.scores[a] ||
                      DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b)
                  )
                  .map((d, rank) => (
                    <div key={d}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-sm font-semibold text-ink">
                          {DIMENSION_META[d].name}
                          <span className="ml-2 text-[11px] font-normal text-muted">
                            {DIMENSION_META[d].en}
                          </span>
                        </span>
                        <span className="text-sm font-bold text-ink">{displayResult.scores[d]}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-rule/40">
                        <div
                          className={`h-full rounded-full ${BAR_COLORS[rank]}`}
                          style={{ width: `${displayResult.scores[d]}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-muted">
                        {DIMENSION_META[d].desc}
                      </p>
                    </div>
                  ))}
              </div>

              {/* 兴趣代码解读（LLM 生成）+ 推荐探索方向 */}
              {(explaining || explanation || explainError) && (
                <div className="mt-6 rounded-2xl border border-sage-300/60 bg-gradient-to-br from-sage-50 to-amber-50/60 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-[12px]">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>
                    </span>
                    <h4 className="text-sm font-bold text-sage-800">兴趣代码解读 · 推荐方向</h4>
                  </div>

                  {explaining && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>正在为你生成职业解读…</span>
                        <span>{Math.round(explainProgress)}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-rule/30">
                        <div
                          className="h-full rounded-full bg-sage-500 transition-all duration-300"
                          style={{ width: `${explainProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {explainError && (
                    <p className="text-xs leading-6 text-coral-700">
                      {explainError}
                    </p>
                  )}

                  {explanation && !explaining && (
                    <>
                      <p className="text-sm leading-7 text-ink/90">
                        {explanation}
                      </p>
                      {explainJobs.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-semibold text-sage-700">可能你会对以下职业感兴趣：</p>
                          <div className="flex flex-wrap gap-2">
                            {explainJobs.map((j) => (
                              <span
                                key={j.jobCn}
                                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-sage-800 shadow-sm ring-1 ring-sage-200"
                                title={j.industry ? `${j.industry} · ${j.entryPath}` : ''}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-sage-400" />
                                {j.jobCn}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 储存区 */}
            {saved ? (
              <div className="mt-4 rounded-2xl border border-sage-400/30 bg-sage-50 p-6 text-center">
                <button
                  type="button"
                  onClick={restart}
                  className="block w-full rounded-xl bg-sage-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-sage-600 active:scale-[.98]"
                >
                  重新测一次
                </button>
                <p className="mt-3 text-xs text-muted">
                  新结果会覆盖旧结果
                </p>
              </div>
            ) : (
              <div className="letter-paper mt-4 rounded-2xl p-6">
                {saveError && (
                  <p className="mb-3 rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-700">
                    {saveError}
                  </p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[.98] disabled:opacity-50"
                  >
                    {saving
                      ? retryCount > 0
                        ? `储存中…重试 ${retryCount}/2`
                        : '储存中…'
                      : '储存并解释结果'}
                  </button>
                  <button
                    onClick={restart}
                    className="rounded-xl border border-rule bg-white px-6 py-3 text-sm font-medium text-muted transition-all hover:bg-bg"
                  >
                    重新测一次
                  </button>
                </div>
              </div>
            )}

            {/* 底部声明 */}
            <p className="mt-4 rounded-xl bg-bg/70 px-4 py-3 text-xs leading-6 text-muted">
              分数表示你相对的兴趣强弱，不代表能力高低，也不能单独决定适合的职业；兴趣没有好坏，每种组合都对应着一大批值得探索的职业可能。
            </p>
            <p className="mt-3 px-4 text-[11px] leading-5 text-muted/70">
              本测评基于 Holland RIASEC 职业兴趣框架，职业数据参考 ONET 及国内招聘信息独立整理。结果仅作为职业方向探索的参考，不构成人生选择的定论或承诺；职业发展还受能力、经验、机遇等多重因素影响，建议结合实际情况综合判断。
            </p>
          </section>
        )}
      </div>

      {/* 未登录引导注册弹窗 */}
      {guestDialog && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setGuestDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-lg font-bold text-ink">把结果带走？</h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              储存测试结果需要先注册一个账号。注册完成后，你的个人档案会同时包含这次兴趣测试结果，以后还能随时查看和重测，过程只要一分钟。
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                onClick={goRegisterWithResult}
                className="w-full rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[.98]"
              >
                去注册并储存结果
              </button>
              <button
                onClick={() => setGuestDialog(false)}
                className="w-full rounded-xl border border-rule bg-white px-6 py-2.5 text-sm font-medium text-muted transition-all hover:bg-bg"
              >
                暂不储存
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
