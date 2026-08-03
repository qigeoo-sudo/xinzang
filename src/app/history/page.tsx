"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { History, Clock, ArrowLeft, Trash2, ArrowUpDown, MessageCircle, Sparkles } from "lucide-react";
import { MentorAvatar } from "@/components/shared/mentor-avatar";
import { useI18n } from "@/lib/i18n";
import {
  getAllSessions,
  deleteSession,
  sortSessionsByTime,
  sortSessionsByMentor,
  formatRelativeTime,
  type ChatSession,
} from "@/lib/chat-history";
import { cn } from "@/lib/utils";

type SortMode = "time" | "mentor";

export default function HistoryPage() {
  const { tr, trFmt, lang } = useI18n();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    refreshSessions();
    setHydrated(true);
  }, []);

  function refreshSessions() {
    const all = getAllSessions();
    setSessions(sortMode === "time" ? sortSessionsByTime(all) : sortSessionsByMentor(all));
  }

  function toggleSort() {
    const newMode = sortMode === "time" ? "mentor" : "time";
    setSortMode(newMode);
    const all = getAllSessions();
    setSessions(newMode === "time" ? sortSessionsByTime(all) : sortSessionsByMentor(all));
  }

  function handleDelete(id: string) {
    if (confirm(tr({ zh: "确定删除这条对话记录吗？", en: "Delete this conversation?" }))) {
      deleteSession(id);
      refreshSessions();
    }
  }

  const sortedSessions = sortMode === "time" ? sortSessionsByTime(sessions) : sortSessionsByMentor(sessions);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-8 md:py-12 md:pb-12">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold text-brand-900 mb-1">
              {tr({ zh: "对话记录", en: "Chat History" })}
            </h1>
            <p className="text-sm text-slate-500">
              {tr({ zh: "你的所有对话历史", en: "All your conversation history" })}
            </p>
          </div>

          {/* Sort toggle */}
          {sortedSessions.length > 0 && (
            <button
              onClick={toggleSort}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-brand-300 hover:text-brand-600"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortMode === "time"
                ? tr({ zh: "按时间排序", en: "Sort by Time" })
                : tr({ zh: "按导师排序", en: "Sort by Mentor" })}
            </button>
          )}
        </div>
      </div>

      {/* Sessions list */}
      {hydrated && sortedSessions.length === 0 ? (
        <div className="card text-center py-16">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <History className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="font-bold text-brand-900 mb-1">
            {tr({ zh: "还没有对话记录", en: "No conversations yet" })}
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            {tr({ zh: "开始你的第一次对话吧", en: "Start your first conversation" })}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/chat" className="btn-primary text-sm">
              <MessageCircle className="h-4 w-4" />
              {tr({ zh: "与AI职导对话", en: "Chat with AI Guider" })}
            </Link>
            <Link href="/mentor" className="btn-secondary text-sm">
              {tr({ zh: "浏览行业导师", en: "Browse Mentors" })}
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedSessions.map((session) => (
            <div
              key={session.id}
              className="card group flex items-start gap-4 hover:border-brand-200 transition-colors"
            >
              {/* Avatar */}
              {session.mentorId === "general" ? (
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-sm">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
              ) : (
                <MentorAvatar name={session.mentorName} avatar={session.mentorAvatar} size="md" />
              )}

              {/* Content */}
              <Link href={`/history/${session.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-sm text-brand-900 truncate">{session.mentorName}</h3>
                  {session.mentorId === "general" && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-0.5 text-[10px] font-medium text-brand-600 whitespace-nowrap shrink-0">
                      {tr({ zh: "AI职导", en: "AI Guider" })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 line-clamp-1 mb-1">{session.title}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(session.updatedAt, lang)}
                  </span>
                  <span>
                    {trFmt(
                      { zh: "{count} 条消息", en: "{count} messages" },
                      { count: session.messages.filter((m) => m.role === "user").length }
                    )}
                  </span>
                </div>
              </Link>

              {/* Delete button */}
              <button
                onClick={() => handleDelete(session.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                title={tr({ zh: "删除", en: "Delete" })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {tr({ zh: "返回成长追踪", en: "Back to Growth" })}
        </Link>
      </div>
    </div>
  );
}
