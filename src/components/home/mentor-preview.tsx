'use client';

import Link from 'next/link';
import Image from 'next/image';
import { mentorPreview } from '@/lib/mentor-preview';

const copy = {
  zh: {
    kicker: 'MENTORS',
    title: '行业导师 AI 分身',
    all: '看所有导师分身',
    years: (y: string) => `${y}年经验`,
  },
  en: {
    kicker: 'MENTORS',
    title: 'Mentor AI Personas',
    all: 'See all personas',
    years: (y: string) => `${y} yrs`,
  },
};

export function MentorPreview({ lang }: { lang: 'zh' | 'en' }) {
  const t = copy[lang];

  return (
    <section className="mx-auto max-w-[840px] px-5 pb-16 md:pb-20">
      {/* 栏目标题 */}
      <div className="mb-2 flex items-end justify-between gap-4 border-b border-ink/10 pb-3">
        <div>
          <p className="masthead-label">{t.kicker}</p>
          <h2 className="mt-1.5 font-serif text-[22px] font-bold leading-tight text-ink md:text-2xl">
            {t.title}
          </h2>
        </div>
        <Link
          href="/mentors"
          className="group shrink-0 pb-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink/60 transition-colors hover:text-ink"
        >
          <span className="border-b border-ink/25 pb-0.5 transition-colors group-hover:border-ink/70">
            {t.all}
          </span>
          <span aria-hidden className="ml-1.5 inline-block transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>

      {/* 导师条目：杂志撰稿人式 */}
      <div>
        {mentorPreview.map((m) => (
          <Link
            key={m.id}
            href={`/mentors/${m.id}`}
            className="group flex items-center gap-4 border-b border-ink/10 py-4 transition-opacity last:border-b-0 hover:opacity-100 md:gap-5 md:py-5"
          >
            <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[14px] bg-bg-cream shadow-[0_4px_12px_rgba(44,62,92,0.08)] md:h-[92px] md:w-[92px]">
              {/* TODO: 3D 黏土头像素材就绪后 src 切换为 m.avatar3d */}
              <Image
                src={m.avatar}
                alt={m.name}
                fill
                sizes="92px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h3 className="font-serif text-[17px] font-bold text-ink md:text-lg">{m.name}</h3>
                <span className="font-mono text-[11px] font-medium text-ink/50">
                  {typeof m.years === 'number'
                    ? t.years(String(m.years))
                    : /^[>0-9]/.test(m.years)
                      ? t.years(m.years)
                      : m.years}
                </span>
              </div>
              <p className="mt-1 truncate text-[13px] text-muted">
                {m.title}
                <span className="mx-1.5 text-ink/30">·</span>
                {m.company}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-ink/12 px-2.5 py-0.5 text-[11px] text-ink/65"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <span
              aria-hidden
              className="shrink-0 self-center pr-1 text-lg text-ink/35 transition-all group-hover:translate-x-1 group-hover:text-ink"
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
