import { Header } from '@/components/header';
import { HomeContent } from '@/components/home-content';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <HomeContent />
    </div>
  );
}
