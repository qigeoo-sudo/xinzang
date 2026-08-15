import Link from 'next/link';
import { Header } from '@/components/header';
import { mentors, getAllIndustries } from '@/lib/mentors';

export default function MentorsPage() {
  // 排除 AI 职导，只展示行业导师
  const industryMentors = mentors.filter((m) => m.id !== 'ai-guide');
  const industries = getAllIndustries().filter((i) => i !== '通用');

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink mb-2">行业导师 AI 分身</h1>
          <p className="text-sm text-muted leading-relaxed">
            不是普通 AI 聊天机器人 — 核心资产是汇聚真实职业智慧的全球人脉网络
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
            <Link
              key={mentor.id}
              href={`/mentors/${mentor.id}`}
              className="card card-hover flex gap-4"
            >
              {/* 头像 */}
              <div className="flex-shrink-0">
                {mentor.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mentor.avatar}
                    alt={mentor.name}
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
                    <span className="text-white text-lg font-bold">
                      {mentor.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-ink text-sm">
                    {mentor.name}
                  </h3>
                  <span className="text-xs text-muted">{mentor.years}年经验</span>
                </div>
                <p className="text-xs text-muted mb-1">
                  {mentor.title} . {mentor.company}
                </p>
                <p className="text-xs text-ink/80 mb-2 line-clamp-1">
                  {mentor.tagline}
                </p>
                <div className="flex flex-wrap gap-1">
                  {mentor.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded bg-beige text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* 底部说明 */}
        <div className="mt-8 p-4 rounded-lg bg-beige border border-rule text-center">
          <p className="text-xs text-muted leading-relaxed">
            每位导师 AI 分身基于真实深度专访打造，拥有真实知识库
            <br />
            成为会员即可与全部导师分身对话
          </p>
        </div>
      </div>
    </div>
  );
}
