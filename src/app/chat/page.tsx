'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/header';
import { getMentorById } from '@/lib/mentors';
import { MentorChat } from '@/components/mentor-chat';

export default function ChatPage() {
  const mentor = getMentorById('ai-guide');
  const [needQuestionnaire, setNeedQuestionnaire] = useState(false);

  // 检查 URL 参数 — 是否从档案页跳转来
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setNeedQuestionnaire(params.get('need') === 'questionnaire');
    }
  }, []);

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

      <div className="page-container">
        {/* 问卷未完成提示 */}
        {needQuestionnaire && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-lg mb-4">
            我们的访谈还没有完成，请继续回答 AI 职导的问题，完成后才能打开我的档案。
          </div>
        )}

        <MentorChat mentor={mentor} />
      </div>
    </div>
  );
}
