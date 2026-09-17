import Link from 'next/link';
import type { MentorCardData } from '@/lib/search';

interface MentorCardProps {
  mentor: MentorCardData & { comingSoon?: boolean };
  /** 搜索结果页：命中依据标签（如「知识卡」「标签/行业」） */
  reasons?: string[];
}

/** 导师分身卡片 — 导师列表页与关键词搜索结果页共用 */
export function MentorCard({ mentor, reasons }: MentorCardProps) {
  const isLocked = mentor.comingSoon === true;

  return (
    <Link
      href={isLocked ? '#' : `/mentors/${mentor.id}`}
      className={`letter-paper relative flex gap-4 rounded-[18px] p-4 transition-transform duration-300 ${
        isLocked ? 'cursor-not-allowed' : 'hover:-translate-y-0.5'
      }`}
      onClick={isLocked ? (e) => e.preventDefault() : undefined}
    >
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
        <p className="mb-1 text-xs text-muted">
          {mentor.title} . {mentor.company}
        </p>
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
    </Link>
  );
}
