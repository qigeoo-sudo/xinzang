'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { MentorCardData } from '@/lib/search';
import { track } from '@/lib/analytics/tracker';

interface MentorCardProps {
  mentor: MentorCardData & { comingSoon?: boolean };
  /** 搜索结果页：命中依据标签（如「知识卡」「标签/行业」） */
  reasons?: string[];
  /** 卡片在当前列表中的位置（不传则挂载后按 DOM 顺序推算） */
  position?: number;
}

/** 导师分身卡片 — 导师列表页与关键词搜索结果页共用
 *  自动上报：进入视口 ≥50% 且停留 ≥0.5 秒算一次曝光（每页每卡一次）；点击算一次打开 */
export function MentorCard({ mentor, reasons, position }: MentorCardProps) {
  const isLocked = mentor.comingSoon === true;
  const rootRef = useRef<HTMLAnchorElement | HTMLDivElement | null>(null);
  const [domPosition, setDomPosition] = useState(position ?? 0);

  useEffect(() => {
    if (typeof position === 'number') {
      setDomPosition(position);
      return;
    }
    const el = rootRef.current;
    const parent = el?.parentElement;
    if (el && parent) {
      const idx = Array.from(parent.querySelectorAll('[data-mentor-card]')).indexOf(el);
      setDomPosition(idx >= 0 ? idx : 0);
    }
  }, [position]);

  // 曝光：IntersectionObserver ≥50%，满足后再等 0.5 秒确认，期间离开则取消
  useEffect(() => {
    const el = rootRef.current;
    if (!el || isLocked) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.5) {
            timer = setTimeout(() => {
              track('mentor_card.impression', {
                props: {
                  mentorId: mentor.id,
                  position: domPosition,
                  sourcePage: window.location.pathname,
                  ctaId: 'mentor_card_impression',
                },
              });
              observer.disconnect();
            }, 500);
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [mentor.id, domPosition, isLocked]);

  const cardCls = `letter-paper relative flex gap-4 rounded-[18px] p-4 transition-transform duration-300 ${
    isLocked ? 'cursor-not-allowed' : 'hover:-translate-y-0.5'
  }`;

  const content = (
    <>
      {/* 头像 */}
      <div className="flex-shrink-0">
        {mentor.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mentor.avatar}
            alt={mentor.name}
            className="h-16 w-16 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-light">
            <span className="text-lg font-bold text-white">
              {mentor.name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{mentor.name}</h3>
          {typeof mentor.years === 'number'
            ? mentor.years !== 0 && (
                <span className="text-xs text-muted">{mentor.years}年经验</span>
              )
            : mentor.years
              ? /^[>0-9]/.test(mentor.years)
                ? <span className="text-xs text-muted">{mentor.years}年经验</span>
                : <span className="text-xs text-muted">{mentor.years}</span>
              : null}
          {isLocked && (
            <span className="ml-auto text-xs text-slate-400">等待上线</span>
          )}
        </div>
        <p className="mb-2 line-clamp-1 text-xs text-ink/80">{mentor.tagline}</p>

        {reasons && reasons.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {reasons.map((r) => (
              <span
                key={r}
                className="rounded bg-sage-50 px-2 py-0.5 text-xs text-sage-700"
              >
                命中{r}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {mentor.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-beige px-2 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 未解锁：卡片右下角上一把锁（同色系深沙金，比暖白信纸深一档） */}
      {isLocked && (
        <span className="absolute bottom-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#D9C4A0] text-[#5C4A2E] shadow-[0_2px_6px_rgba(92,74,46,0.25)] ring-1 ring-white/60">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
      )}
    </>
  );

  const onClick = () => {
    track('mentor_card.click', {
      props: {
        mentorId: mentor.id,
        position: domPosition,
        sourcePage: window.location.pathname,
        ctaId: 'mentor_card_open',
      },
    });
  };

  // 未解锁卡：用 div（role=button + aria-disabled）而非 <a href="#">。
  // Edge 等浏览器内置的内容拦截器会把空锚点（href="#"）当作广告占位链接直接隐藏，
  // div 不触发任何锚点过滤规则，外观与不可点击行为保持一致。
  if (isLocked) {
    return (
      <div
        ref={rootRef as React.RefObject<HTMLDivElement>}
        role="button"
        aria-disabled="true"
        tabIndex={-1}
        data-mentor-card
        className={cardCls}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      ref={rootRef as React.RefObject<HTMLAnchorElement>}
      href={`/mentors/${mentor.id}`}
      className={cardCls}
      data-mentor-card
      onClick={onClick}
    >
      {content}
    </Link>
  );
}
