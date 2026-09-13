import type { Metadata } from 'next';
import { Header } from '@/components/header';
import { AssessmentFlow } from '@/components/assessment/assessment-flow';
import { HomeFooter } from '@/components/home/home-footer';

export const metadata: Metadata = {
  title: '职业兴趣测试 (RIASEC) - 榨职机',
};

export default function AssessmentPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <AssessmentFlow />
      <HomeFooter lang="zh" />
    </div>
  );
}
