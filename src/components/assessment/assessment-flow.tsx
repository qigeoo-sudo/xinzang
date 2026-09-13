'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
import { scoreAnswers, type AnswerItem } from '@/lib/riasec/score';
import { savePendingAssessment } from '@/lib/riasec/storage';

type Stage = 'intro1' | 'intro2' | 'test' | 'result';

const RATING_LABELS = ['非常不想做', '不太想做', '一般，没有明显偏好', '比较想做', '非常想做'];
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
  const [guestDialog, setGuestDialog] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === order.length;

  const result = useMemo(() => {
    if (stage !== 'result') return null;
    const items: AnswerItem[] = order
      .map((q) => ({ qid: q.id, value: answers[q.id] }))
      .filter((a) => typeof a.value === 'number');
    return scoreAnswers(order, items);
  }, [stage, order, answers]);

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
    setGuestDialog(false);
    setStage('test');
  };

  const choose = (value: number) => {
    const q = order[idx];
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    if (idx < order.length - 1) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => setIdx((i) => i + 1), 220);
    }
  };

  const handleSave = async () => {
    if (!payload) return;
    setSaveError('');

    if (status !== 'authenticated') {
      setGuestDialog(true);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // 客户端会话状态过期（如 cookie 失效）时，回退到访客注册引导
      if (res.status === 401 || res.status === 403) {
        setGuestDialog(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '保存失败');
      }
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  };

  const goRegisterWithResult = () => {
    if (payload) savePendingAssessment(payload);
    router.push('/register-v2');
  };

  return (
    <main className="flex-1 bg-bg">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:py-12">
        {stage === 'intro1' && (
          <section className="rounded-2xl border border-rule/40 bg-white/85 p-6 shadow-sm md:p-8">
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
          <section className="rounded-2xl border border-rule/40 bg-white/85 p-6 shadow-sm md:p-8">
            <h1 className="font-serif text-2xl font-black text-ink md:text-3xl">怎么作答</h1>
            <p className="mt-3 text-sm leading-7 text-muted">
              每道题描述一种工作活动，暂时不考虑会不会、要学多久，只看你有多想做，请选择 1-5 分：
            </p>

            <div className="mt-5 grid grid-cols-5 gap-2">
              {RATING_LABELS.map((label, i) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-xl border border-rule/50 bg-bg/60 px-1 py-3"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                    {i + 1}
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
            <div className="mb-4">
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

            <div className="rounded-2xl border border-rule/40 bg-white/85 p-6 shadow-sm md:p-8">
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
                      key={label}
                      onClick={() => choose(value)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all active:scale-[.99] ${
                        selected
                          ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                          : 'border-rule/60 bg-white text-ink/80 hover:border-brand-300 hover:bg-brand-50/50'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          selected ? 'bg-brand-500 text-white' : 'bg-bg text-muted'
                        }`}
                      >
                        {value}
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

        {stage === 'result' && result && payload && (
          <section>
            <div className="rounded-2xl border border-rule/40 bg-white/85 p-6 shadow-sm md:p-8">
              <h1 className="font-serif text-2xl font-black text-ink md:text-3xl">
                你的兴趣画像
              </h1>

              {/* 主码 */}
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-beige/70 px-5 py-4">
                <span className="shrink-0 text-xs text-muted">兴趣代码</span>
                <span className="flex shrink-0 gap-1.5">
                  {result.code.split('').map((d, i) => (
                    <span
                      key={d}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-base font-black text-white ${BAR_COLORS[i]}`}
                    >
                      {d}
                    </span>
                  ))}
                </span>
                <span className="w-full text-sm font-semibold leading-6 text-ink sm:w-auto sm:shrink-0">
                  {result.code
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
                      result.scores[b] - result.scores[a] ||
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
                        <span className="text-sm font-bold text-ink">{result.scores[d]}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-rule/40">
                        <div
                          className={`h-full rounded-full ${BAR_COLORS[rank]}`}
                          style={{ width: `${result.scores[d]}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-muted">
                        {DIMENSION_META[d].desc}
                      </p>
                    </div>
                  ))}
              </div>

              <p className="mt-5 rounded-xl bg-bg/70 px-4 py-3 text-xs leading-6 text-muted">
                分数表示你相对的兴趣强弱，不代表能力高低，也不能单独决定适合的职业；兴趣没有好坏，每种组合都对应着一大批值得探索的职业可能。
              </p>
            </div>

            {/* 储存区 */}
            {saved ? (
              <div className="mt-4 rounded-2xl border border-sage-400/30 bg-sage-50 p-6 text-center">
                <p className="text-base font-bold text-sage-700">测试结果已存到你的档案</p>
                <p className="mt-1.5 text-xs text-muted">
                  以后可以在“成长追踪 → 我的档案”里查看和重测。
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link
                    href="/dashboard/profile"
                    className="rounded-xl bg-sage-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-sage-600 active:scale-[.98]"
                  >
                    查看我的档案
                  </Link>
                  <Link
                    href="/"
                    className="rounded-xl border border-rule bg-white px-6 py-3 text-sm font-medium text-muted transition-all hover:bg-bg"
                  >
                    返回首页
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-rule/40 bg-white/85 p-6">
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
                    {saving ? '储存中…' : '储存测试结果'}
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
