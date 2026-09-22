'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Header } from '@/components/header';
import { MentorCard } from '@/components/mentor-card';
import { PageHero, PaperCredits, GoldFlakes } from '@/components/page-shell';
import { sortMentorsForList, getAllIndustries } from '@/lib/mentors';

const PAGE_SIZE = 10;

// 临时诊断：排查安卓端锁定导师卡片消失（验证后删除）
function MentorDiagBar() {
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => {
    const snap = (tag: string) => {
      const html = document.documentElement.innerHTML;
      const count = (re: string) =>
        (html.match(new RegExp(re, 'g')) || []).length;
      return `${tag}: a=${document.querySelectorAll('a').length} Freya=${count('Freya')} KevinYuan=${count('Kevin Yuan')}`;
    };
    const out = [
      `ua=${navigator.userAgent.slice(-48)}`,
      `jsMentors=${sortMentorsForList().length} ready=${document.readyState}`,
      (window as unknown as { __preHTML?: string }).__preHTML || 'PRE=n/a',
      snap('T0'),
    ];
    const errs: string[] = [];
    const onErr = (e: ErrorEvent) =>
      errs.push('ERR:' + (e.message || '').slice(0, 90));
    const onRej = (e: PromiseRejectionEvent) =>
      errs.push('REJ:' + String(e.reason).slice(0, 90));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    setTimeout(() => {
      out.push(snap('T1'));
      out.push(...errs.slice(0, 3));
      // 逐卡体检：位置/尺寸/可见性/头像加载（验证后删除）
      const cards = Array.from(document.querySelectorAll('main a')).filter(
        (a) => a.querySelector('img') || a.querySelector('h3')
      );
      cards.slice(0, 8).forEach((a, i) => {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        const img = a.querySelector('img');
        const imgSt = img
          ? `img:${img.naturalWidth}x${img.naturalHeight}/${img.complete}`
          : 'noimg';
        out.push(
          `c${i + 1} ${(a.textContent || '').replace(/\s+/g, ' ').slice(0, 16)} ` +
            `${Math.round(r.width)}x${Math.round(r.height)} y=${Math.round(r.top)} ` +
            `${cs.display}/${cs.visibility}/${cs.opacity} ${imgSt}`
        );
      });
      // c5 若被隐藏：找出命中它的 CSS 规则来源（验证后删除）
      const c5 = cards[4];
      if (c5) {
        out.push('c5 inlineStyle=' + (c5 as HTMLElement).style.cssText || 'c5 inlineStyle=');
        const hits: string[] = [];
        document.styleSheets.forEach((ss) => {
          let rules: CSSRuleList;
          try {
            rules = ss.cssRules;
          } catch {
            return;
          }
          Array.from(rules).forEach((rule) => {
            const st = rule as CSSStyleRule;
            if (!st.selectorText) return;
            const sels = st.selectorText.split(',');
            if (sels.some((s) => { try { return c5.matches(s.trim()); } catch { return false; } })) {
              const display = st.style.display;
              if (display) hits.push(`${st.selectorText.slice(0, 60)}{${display}}`);
            }
          });
        });
        out.push('matchedRules=' + (hits.join(' | ').slice(0, 220) || 'none'));
        const p = c5.parentElement;
        if (p) {
          const pcs = getComputedStyle(p);
          out.push(`grid: ${pcs.display} ${pcs.gridTemplateColumns.slice(0, 40)} childCount=${p.children.length}`);
        }
      }
      setLines(out);
    }, 1500);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);
  if (!lines) return null;
  return (
    <div className="fixed left-2 right-2 top-2 z-[200] whitespace-pre-wrap rounded bg-black/90 p-2 text-[10px] leading-4 text-green-300">
      {lines.join('\n')}
    </div>
  );
}

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
      <MentorDiagBar />
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

          {/* 临时诊断：解析到此时全部卡片已在 DOM、React hydration 尚未开始，
              记录初始 HTML 的真实卡片数（验证后删除） */}
          <script
            dangerouslySetInnerHTML={{
              __html:
                "window.__preHTML='PRE Freya='+(document.documentElement.innerHTML.match(/Freya/g)||[]).length+' a='+document.querySelectorAll('a').length",
            }}
          />

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
