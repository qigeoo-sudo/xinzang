'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/header';
import { LanguageToggle } from '@/components/language-toggle';
import { getMentorById } from '@/lib/mentors';
import { MentorChat } from '@/components/mentor-chat';

export default function ChatPage() {
  const mentor = getMentorById('ai-guide');
  const { data: session, status } = useSession();
  const [cardLocked, setCardLocked] = useState(false);

  // 监听问卷完成事件 & 检查 localStorage 中的完成状态
  useEffect(() => {
    // 未登录时不锁定
    if (status !== 'authenticated' || !session?.user?.id) {
      setCardLocked(false);
      return;
    }

    // 检查 localStorage 中是否已完成问卷（按用户隔离）
    try {
      const uid = session.user.id;
      const completed = localStorage.getItem(`ai-guide-completed-${uid}`) === 'true';
      const limitTimestamp = localStorage.getItem(`ai-guide-limit-timestamp-${uid}`);

      if (limitTimestamp) {
        const elapsed = Date.now() - parseInt(limitTimestamp, 10);
        if (elapsed < 24 * 60 * 60 * 1000 && completed) {
          setCardLocked(true);
        } else {
          setCardLocked(false);
        }
      } else if (completed) {
        setCardLocked(true);
      } else {
        setCardLocked(false);
      }
    } catch {
      setCardLocked(false);
    }

    // 监听问卷完成事件
    const handleCompleted = () => setCardLocked(true);
    window.addEventListener('questionnaireCompleted', handleCompleted);
    return () => window.removeEventListener('questionnaireCompleted', handleCompleted);
  }, [status, session?.user?.id]);

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
      <LanguageToggle />

      <div className="page-container">
        {/* 导师信息卡 — 问卷完成后锁定在顶部 */}
        <div className={`card mb-6 ${cardLocked ? 'sticky top-14 md:top-14 z-40' : ''}`}>
          <div className="flex gap-4">
            {/* 头像 */}
            <div className="flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-sage-400 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                </svg>
              </div>
            </div>

            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-bold text-brand-900">{mentor.name}</h1>
                <span className="tag bg-brand-50 text-brand-600">免费</span>
              </div>
              <p className="text-xs text-slate-500 mb-1">
                {mentor.title} . {mentor.company}
              </p>
              <p className="text-sm text-brand-900/80 mb-2">{mentor.tagline}</p>
              <div className="flex flex-wrap gap-1">
                {mentor.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded bg-sage-50 text-sage-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <MentorChat mentor={mentor} />
      </div>
    </div>
  );
}
