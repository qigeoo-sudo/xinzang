"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { ChatInterface } from "@/components/chat/chat-interface";
import { useI18n } from "@/lib/i18n";
import { getSessionById, type ChatSession } from "@/lib/chat-history";

export default function HistoryDetailPage() {
  const params = useParams();
  const { tr } = useI18n();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const sessionId = params.id as string;

  useEffect(() => {
    const s = getSessionById(sessionId);
    setSession(s);
    setHydrated(true);
  }, [sessionId]);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <History className="h-7 w-7 text-slate-400" />
        </div>
        <h3 className="font-bold text-brand-900 mb-1">
          {tr({ zh: "对话记录不存在", en: "Conversation not found" })}
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          {tr({ zh: "该记录可能已被删除", en: "This record may have been deleted" })}
        </p>
        <Link href="/history" className="btn-primary text-sm">
          <ArrowLeft className="h-4 w-4" />
          {tr({ zh: "返回对话记录", en: "Back to History" })}
        </Link>
      </div>
    );
  }

  const isAIMentor = session.mentorId === "general";

  return (
    <div>
      {/* Top bar with back link */}
      <div className="border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-4 py-2">
        <Link
          href="/history"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          {tr({ zh: "返回对话记录", en: "Back to History" })}
        </Link>
      </div>

      <ChatInterface
        mentorId={isAIMentor ? undefined : session.mentorId}
        mentorName={session.mentorName}
        mentorAvatar={session.mentorAvatar}
        sessionId={session.id}
        readOnly={true}
      />
    </div>
  );
}
