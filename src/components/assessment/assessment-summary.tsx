'use client';

/**
 * RIASEC 测评结果展示块 — 注册成功页、个人档案页共用
 * 只负责展示：兴趣代码色块 + 六维条形图
 */
import { DIMENSIONS, DIMENSION_META } from '@/lib/riasec/questions';
import type { AssessmentPayload } from '@/lib/register-v2';

const BAR_COLORS = [
  'bg-brand-500',
  'bg-sage-500',
  'bg-gold-400',
  'bg-coral-500',
  'bg-sand-500',
  'bg-muted',
];

export function AssessmentSummary({
  assessment,
  takenAtLabel,
}: {
  assessment: Pick<AssessmentPayload, 'scores' | 'code'>;
  takenAtLabel?: string;
}) {
  const ranked = DIMENSIONS.slice().sort(
    (a, b) => assessment.scores[b] - assessment.scores[a] || DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b)
  );
  // 无存量 code 时按同分并列规则现场推导（与 scoreAnswers 一致）
  const thirdScore = assessment.scores[ranked[2]];
  const fallbackCode = ranked
    .filter((d, i) => i < 2 || assessment.scores[d] === thirdScore)
    .join('');
  const code = assessment.code || fallbackCode;

  return (
    <div
      className="mb-5 rounded-[14px] p-4"
      style={{ background: 'rgba(122,158,110,0.08)', border: '1px solid rgba(122,158,110,0.25)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold" style={{ color: '#2C3E5C' }}>
          职业兴趣测试结果
        </h3>
        {takenAtLabel && (
          <span className="shrink-0 text-[11px]" style={{ color: '#9C8E7C' }}>
            {takenAtLabel}
          </span>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="flex shrink-0 gap-1.5">
          {code.split('').map((d, i) => (
            <span
              key={`${d}-${i}`}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white ${BAR_COLORS[i]}`}
            >
              {d}
            </span>
          ))}
        </span>
        <span
          className="w-full text-[13px] font-semibold leading-6 sm:w-auto sm:shrink-0"
          style={{ color: '#2C3E5C' }}
        >
          {code
            .split('')
            .map((d) => DIMENSION_META[d as keyof typeof DIMENSION_META]?.name)
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="space-y-2.5">
        {ranked.map((d, rank) => (
          <div key={d} className="flex items-center gap-2.5">
            <span className="w-14 shrink-0 text-[12px]" style={{ color: '#5A6B7E' }}>
              {DIMENSION_META[d].name}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(209,213,219,0.5)' }}>
              <div
                className={`h-full rounded-full ${BAR_COLORS[rank]}`}
                style={{ width: `${assessment.scores[d]}%` }}
              />
            </div>
            <span className="w-7 shrink-0 text-right text-[12px] font-bold" style={{ color: '#2C3E5C' }}>
              {assessment.scores[d]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
