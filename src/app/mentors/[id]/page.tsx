import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { getMentorById, mentors } from '@/lib/mentors';
import { MentorChat } from '@/components/mentor-chat';
import { KnowledgePanel } from '@/components/knowledge-panel';

// 预生成导师页面路径
export function generateStaticParams() {
  return mentors.map((m) => ({ id: m.id }));
}

export default function MentorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const mentor = getMentorById(params.id);
  if (!mentor) {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container">
        {/* 导师信息卡 */}
        <div className="card mb-6">
          <div className="flex gap-4">
            {/* 头像 */}
            <div className="flex-shrink-0">
              {mentor.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mentor.avatar}
                  alt={mentor.name}
                  className="w-20 h-20 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">
                    {mentor.name.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-bold text-ink">{mentor.name}</h1>
              </div>
              <p className="text-xs text-muted mb-1">
                {mentor.title} . {mentor.company} . {mentor.years}年经验
              </p>
              <p className="text-sm text-ink/80 mb-2">{mentor.tagline}</p>
              <div className="flex flex-wrap gap-1">
                {mentor.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded bg-beige text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 知识领域 — 可折叠面板 */}
        {mentor.knowledgeEntries.length > 0 && (
          <KnowledgePanel entries={mentor.knowledgeEntries} />
        )}

        {/* 对话区域 */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-ink mb-3">
            和 {mentor.name} 对话
          </h2>
        </div>

        <MentorChat mentor={mentor} />
      </div>
    </div>
  );
}
