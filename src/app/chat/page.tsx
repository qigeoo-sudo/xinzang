'use client';

import { Header } from '@/components/header';
import { getMentorById } from '@/lib/mentors';
import { MentorChat } from '@/components/mentor-chat';

export default function ChatPage() {
  const mentor = getMentorById('ai-guide');

  if (!mentor) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="page-container text-center">
          <p className="text-sm text-muted">AI 职导暂时无法连接，请稍后再试。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container pt-14">
        <MentorChat mentor={mentor} />
      </div>
    </div>
  );
}
