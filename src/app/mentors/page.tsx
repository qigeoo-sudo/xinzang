'use client';

import { Header } from '@/components/header';
import { MentorCard } from '@/components/mentor-card';
import { HomeFooter } from '@/components/home/home-footer';
import { mentors, getAllIndustries } from '@/lib/mentors';

export default function MentorsPage() {
  // 展示所有行业导师（含未解锁）
  const industryMentors = mentors.filter((m) => !m.comingSoon);
  const industries = getAllIndustries().filter((i) => i !== '通用');

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
          <span className="tag tag-accent">全部</span>
          {industries.map((industry) => (
            <span key={industry} className="tag bg-beige text-muted">
              {industry}
            </span>
          ))}
        </div>

        {/* 导师卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {industryMentors.map((mentor) => (
            <MentorCard key={mentor.id} mentor={mentor} />
          ))}
        </div>
      </div>

      <HomeFooter lang="zh" />
    </div>
  );
}
