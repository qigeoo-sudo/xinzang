import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { getMentorById, mentors } from '@/lib/mentors';
import { MentorChat } from '@/components/mentor-chat';
import { KnowledgePanel } from '@/components/knowledge-panel';
import { BackButton } from '@/components/back-button';
import { PageHero, PaperPanel, PaperCredits, GoldFlakes } from '@/components/page-shell';

// 预生成导师页面路径
export function generateStaticParams() {
  return mentors.map((m) => ({ id: m.id }));
}

export default async function MentorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const mentor = getMentorById(params.id);
  if (!mentor || mentor.comingSoon) {
    notFound();
  }

  const yearsText =
    typeof mentor.years === 'number'
      ? mentor.years !== 0
        ? `${mentor.years}年经验`
        : ''
      : mentor.years
        ? /^[>0-9]/.test(mentor.years)
          ? `${mentor.years}年经验`
          : mentor.years
        : '';

  return (
    <div className="relative flex min-h-screen flex-col bg-bg cream-foil overflow-hidden">
      <Header />
      <GoldFlakes />

      <PageHero
        eyebrow={mentor.industry}
        title={mentor.name}
        subtitle={mentor.tagline}
        watermark="聊"
      />

      <main className="relative z-10 flex flex-1 flex-col px-4 py-8 md:py-12">
        <div className="mx-auto w-full max-w-[840px]">
          <BackButton />

          {/* 导师名片：头像 + 头衔 + 标签，落在一张信纸上 */}
          <PaperPanel className="mb-5">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                {mentor.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mentor.avatar}
                    alt={mentor.name}
                    className="h-20 w-20 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-light">
                    <span className="text-2xl font-bold text-white">
                      {mentor.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {yearsText && (
                  <p className="mb-1.5 text-xs text-muted">{yearsText}</p>
                )}
                <p className="mb-2 text-sm leading-relaxed text-ink/85">
                  {mentor.tagline}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {mentor.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-beige px-2.5 py-0.5 text-xs text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </PaperPanel>

          {/* 知识领域 — 折叠面板整体收入信纸 */}
          {mentor.knowledgeEntries.length > 0 && (
            <PaperPanel className="mb-5">
              <KnowledgePanel entries={mentor.knowledgeEntries} />
            </PaperPanel>
          )}

          {/* 对话区域 */}
          <h2 className="mb-3 px-1 font-serif text-[17px] font-bold text-ink">
            和 {mentor.name} 分身对话
          </h2>
          <PaperPanel className="mb-2">
            <MentorChat mentor={mentor} />
          </PaperPanel>
        </div>
      </main>

      <PaperCredits lang="zh" />
    </div>
  );
}
