'use client';

/** 消息反馈条 — 挂在每条 assistant 回复下方
 *  点赞 / 点踩直接提交；报错展开原因选择（冒犯/偏题/幻觉/反复/其他） */
import { useState } from 'react';

export interface InitialFeedback {
  feedbackType: string;
  reportReason: string | null;
}

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'OFFENSIVE', label: '冒犯了我' },
  { value: 'OFF_TOPIC', label: '偏题了' },
  { value: 'HALLUCINATION', label: '出现幻觉' },
  { value: 'REPETITIVE', label: '反复同样回答' },
  { value: 'OTHER', label: '其他' },
];

function ThumbUp({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function ThumbDown({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  );
}

export function MessageFeedbackBar({
  messageId,
  initial,
}: {
  messageId: string;
  initial?: InitialFeedback;
}) {
  const [current, setCurrent] = useState<string | null>(initial?.feedbackType ?? null);
  const [showReasons, setShowReasons] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (feedbackType: string, reportReason?: string) => {
    setPending(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId, feedbackType, reportReason }),
      });
      if (res.ok) {
        setCurrent(feedbackType);
        setShowReasons(false);
      }
    } finally {
      setPending(false);
    }
  };

  const btnCls = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
      active ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-beige hover:text-ink'
    } ${pending ? 'opacity-50' : ''}`;

  return (
    <div className="relative mt-1 flex items-center gap-1">
      <button
        type="button"
        aria-label="点赞"
        className={btnCls(current === 'LIKE')}
        onClick={() => void submit('LIKE')}
      >
        <ThumbUp />
      </button>
      <button
        type="button"
        aria-label="点踩"
        className={btnCls(current === 'DISLIKE')}
        onClick={() => void submit('DISLIKE')}
      >
        <ThumbDown />
      </button>
      <button
        type="button"
        aria-label="报错"
        className={btnCls(current === 'REPORT')}
        onClick={() => setShowReasons((v) => !v)}
      >
        <FlagIcon />
      </button>

      {showReasons && (
        <div className="absolute right-0 top-8 z-20 w-44 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/5">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink hover:bg-beige"
              onClick={() => void submit('REPORT', r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
