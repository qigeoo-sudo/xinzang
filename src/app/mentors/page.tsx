'use client';

import { useState } from 'react';
import { Header } from '@/components/header';
import { MentorCard } from '@/components/mentor-card';
import { HomeFooter } from '@/components/home/home-footer';
import { mentors, getAllIndustries } from '@/lib/mentors';

export default function MentorsPage() {
  const [activeIndustry, setActiveIndustry] = useState<string>('全部');
  const allMentors = mentors; // 展示所有导师（含未解锁）
  const industries = ['全部', ...getAllIndustries().filter((i) => i !== '通用')];

  const filtered = activeIndustry === '全部'
    ? allMentors
    : allMentors.filter((m) => m.industry === activeIndustry);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container flex-1">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink mb-2">行业导师 AI 分身</h1>
          <p className="text-sm text-muted leading-relaxed">
            导师分身的知识经验均来自真实访谈
          </p>
        </div>

        {/* 行业筛选标签 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {industries.map((industry) => (
            <button
              key={industry}
              onClick={() => setActiveIndustry(industry)}
              className={`tag transition-all ${
                activeIndustry === industry
                  ? 'tag-accent'
                  : 'bg-beige text-muted hover:bg-beige/70'
              }`}
            >
              {industry}
            </button>
          ))}
        </div>

        {/* 导师卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((mentor) => (
            <MentorCard key={mentor.id} mentor={mentor} />
          ))}
        </div>
      </div>

      <HomeFooter lang="zh" />
    </div>
  );
}
