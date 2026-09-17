import type { Metadata } from 'next';
import { Header } from '@/components/header';
import { AssessmentFlow } from '@/components/assessment/assessment-flow';
import { PageHero, PaperCredits, GoldFlakes } from '@/components/page-shell';

export const metadata: Metadata = {
  title: '职业兴趣测试 (RIASEC) - 榨职机',
};

export default function AssessmentPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-bg cream-foil overflow-hidden">
      <Header />
      <GoldFlakes />
      <div className="relative z-10 flex flex-1 flex-col">
        <PageHero
          eyebrow="Career Interest Test"
          title="职业兴趣测试"
          subtitle="RIASEC 六维兴趣量表，帮你榨出职业方向"
          watermark="测"
        />
        <AssessmentFlow />
        <PaperCredits lang="zh" />
      </div>
    </div>
  );
}
