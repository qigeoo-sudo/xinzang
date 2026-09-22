'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Header } from '@/components/header';
import { MentorCard } from '@/components/mentor-card';
import { PageHero, PaperCredits, GoldFlakes } from '@/components/page-shell';
import { sortMentorsForList, getAllIndustries } from '@/lib/mentors';

const PAGE_SIZE = 10;

export default function MentorsPage() {
  const [activeIndustry, setActiveIndustry] = useState<string>('全部');
  const [currentPage, setCurrentPage] = useState(1);
  // 展示所有导师（含未解锁），按梯队+上线时间排序
  const allMentors = sortMentorsForList();
  const industries = ['全部', ...getAllIndustries().filter((i) => i !== '通用')];

  const filtered = useMemo(
    () =>
      activeIndustry === '全部'
        ? allMentors
        : allMentors.filter((m) => m.industry === activeIndustry),
    [activeIndustry, allMentors]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 切行业时回到第 1 页（如果当前页超出范围）
  const safePage = Math.min(currentPage, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  // 导师列表开头：翻页后定位到吸顶导航正下方（首次进页面不触发，保留页头）
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevPage = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevPage.current;
    prevPage.current = safePage;
    // 初始加载（prev 为 null）或页码未变时不滚动，让页面停留在页头
    if (prev === null || prev === safePage) return;
    const el = listRef.current;
    if (!el) return;
    const nav = document.querySelector('nav.glass-nav') as HTMLElement | null;
    const navH = nav?.offsetHeight ?? (window.innerWidth >= 768 ? 56 : 89);
    const rect = el.getBoundingClientRect();
    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - navH - 8),
      behavior: 'auto',
    });
  }, [safePage]);

  return (
    <div className="relative flex min-h-screen flex-col bg-bg cream-foil overflow-hidden">
      <Header />
      <GoldFlakes />

      <PageHero
        eyebrow={<>MENTOR AVATAR<span style={{ textTransform: 'lowercase' }}>s</span></>}
        title="行业导师 AI 分身"
        subtitle="导师分身的知识经验均来自真实访谈"
        watermark="师"
      />

      <main className="relative z-10 flex flex-1 flex-col px-4 py-8 md:py-12">
        <div className="mx-auto w-full max-w-[840px]">
          {/* 行业筛选标签 */}
          <div className="relative z-10 mb-6 flex flex-wrap gap-2">
            {industries.map((industry) => {
              const active = activeIndustry === industry;
              return (
                <button
                  key={industry}
                  onClick={() => {
                    setActiveIndustry(industry);
                    setCurrentPage(1);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    active
                      ? 'bg-ink text-white shadow-[0_4px_12px_-4px_rgba(44,62,92,0.45)]'
                      : 'border border-ink/15 text-ink/70 hover:border-ink/30 hover:text-ink'
                  }`}
                >
                  {industry}
                </button>
              );
            })}
          </div>

          {/* 导师卡片网格 */}
          <div ref={listRef} className="relative z-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {paged.map((mentor) => (
              <MentorCard key={mentor.id} mentor={mentor} />
            ))}
          </div>

          {/* 分页导航 */}
          {totalPages > 1 && (
            <div className="relative z-10 mt-8 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rule text-sm text-ink/70 transition-all hover:border-ink/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="上一页"
              >
                ‹
              </button>
              <span className="text-xs text-muted">
                第 <span className="font-semibold text-ink">{safePage}</span> / {totalPages} 页
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rule text-sm text-ink/70 transition-all hover:border-ink/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="下一页"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </main>

      <PaperCredits lang="zh" />
    </div>
  );
}
