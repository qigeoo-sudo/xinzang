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
    setTimeout(async () => {
      const out: string[] = [];
      // 1. Service Worker 数量（无痕环境应为 0）
      let swN = -1;
      try {
        swN = (await navigator.serviceWorker.getRegistrations()).length;
      } catch { /* ignore */ }
      out.push(`swRegs=${swN}`);

      // 2. 网格容器的真实子元素
      const grid = document.querySelector('main .grid');
      if (grid) {
        out.push(`gridChildren=${grid.children.length}`);
        Array.from(grid.children).forEach((ch, i) => {
          const a = ch.querySelector('a') || (ch.tagName === 'A' ? ch : null);
          const cs = getComputedStyle(ch);
          out.push(
            `g${i + 1} ${ch.tagName} disp=${cs.display} href=${(a as HTMLAnchorElement | null)?.getAttribute('href') ?? '-'}`
          );
        });
      }

      // 3. 所有含 Freya 的锚点：真身 outerHTML 头部 + 父链
      const freyaAnchors = Array.from(document.querySelectorAll('a')).filter(
        (a) => (a.textContent || '').includes('Freya') && a.querySelector('h3')
      );
      out.push(`freyaCards=${freyaAnchors.length}`);
      freyaAnchors.slice(0, 1).forEach((a) => {
        out.push('outerHTML=' + a.outerHTML.replace(/\s+/g, ' ').slice(0, 160));
        const chain: string[] = [];
        let el: HTMLElement | null = a;
        for (let d = 0; d < 4 && el; d++) {
          chain.push(`${el.tagName}.${(el.className || '').toString().slice(0, 24)}[${getComputedStyle(el).display}]`);
          el = el.parentElement;
        }
        out.push('parents=' + chain.join(' < '));
      });

      // 4. 命中 Freya 卡且设置 display 的 CSS 规则
      const target = freyaAnchors[0];
      if (target) {
        const hits: string[] = [];
        Array.from(document.styleSheets).forEach((ss) => {
          let rules: CSSRuleList;
          try { rules = ss.cssRules; } catch { return; }
          Array.from(rules).forEach((rule) => {
            const st = rule as CSSStyleRule;
            if (!st.selectorText || !st.style.display) return;
            const sels = st.selectorText.split(',');
            if (sels.some((s) => { try { return target.matches(s.trim()); } catch { return false; } })) {
              hits.push(`${st.selectorText.slice(0, 50)}{${st.style.display}}`);
            }
          });
        });
        out.push('matchedRules=' + (hits.join(' | ').slice(0, 240) || 'none'));
      }
      setLines(out);
    }, 1500);
  }, []);
  if (!lines) return null;
  return (
    <div className="fixed left-2 right-2 top-2 z-[200] max-h-[80vh] overflow-auto whitespace-pre-wrap rounded bg-black/92 p-2 text-[10px] leading-4 text-green-300">
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
