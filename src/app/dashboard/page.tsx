"use client";

import { useState, useEffect } from "react";
import { TrendingUp, MessageCircle, Users, Target, Award, ArrowRight, Sprout } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getAllSessions, formatRelativeTime } from "@/lib/chat-history";
import type { ChatSession } from "@/lib/chat-history";

export default function DashboardPage() {
  const { tr, trFmt, lang } = useI18n();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSessions(getAllSessions());
    setHydrated(true);
  }, []);

  const milestones = [
    {
      title: tr({ zh: "完成职业画像", en: "Complete Career Profile" }),
      description: tr({ zh: "兴趣、性格、技能评估完成", en: "Interests, personality, skills assessment completed" }),
      status: "completed",
      date: "2026-08-02",
    },
    {
      title: tr({ zh: "首次 AI 职导对话", en: "First AI Guider Chat" }),
      description: tr({ zh: "和 AI 职业导师聊了职业方向", en: "Chatted with AI Career Mentor about career direction" }),
      status: "completed",
      date: "2026-08-02",
    },
    {
      title: tr({ zh: "探索 3 个职业方向", en: "Explore 3 Career Directions" }),
      description: tr({ zh: "AI产品经理、HR、数据分析", en: "AI PM, HR, Data Analysis" }),
      status: "in_progress",
      date: "",
    },
    {
      title: tr({ zh: "和行业导师对话", en: "Talk to Industry Veteran" }),
      description: tr({ zh: "选择一位行业导师深入交流", en: "Choose a veteran for in-depth conversation" }),
      status: "pending",
      date: "",
    },
    {
      title: tr({ zh: "完成面试模拟", en: "Complete Mock Interview" }),
      description: tr({ zh: "至少完成 1 次模拟面试", en: "Complete at least 1 mock interview" }),
      status: "pending",
      date: "",
    },
  ];

  const chatCount = hydrated ? sessions.length : 3;
  const mentorChatCount = hydrated
    ? sessions.filter((s) => s.mentorId !== "general").length
    : 1;

  const stats = [
    { label: tr({ zh: "对话次数", en: "Conversations" }), value: chatCount, icon: MessageCircle, color: "text-brand-500", bg: "bg-brand-50", link: "/history" },
    { label: tr({ zh: "探索方向", en: "Directions" }), value: 2, icon: Target, color: "text-sage-500", bg: "bg-sage-50", link: null },
    { label: tr({ zh: "导师对话", en: "Mentor Chats" }), value: mentorChatCount, icon: Users, color: "text-sand-600", bg: "bg-sand-50", link: "/history" },
    { label: tr({ zh: "成长里程碑", en: "Milestones" }), value: 2, icon: Award, color: "text-brand-500", bg: "bg-brand-50", link: null },
  ];

  const careerInterests = [
    { name: tr({ zh: "AI/科技", en: "AI/Tech" }), match: 85, tags: [tr({ zh: "数据分析", en: "Data Analysis" }), tr({ zh: "产品思维", en: "Product Thinking" })] },
    { name: tr({ zh: "人力资源", en: "Human Resources" }), match: 72, tags: [tr({ zh: "沟通能力", en: "Communication" }), tr({ zh: "共情力", en: "Empathy" })] },
    { name: tr({ zh: "医疗健康", en: "Healthcare" }), match: 65, tags: [tr({ zh: "行业兴趣", en: "Industry Interest" }), tr({ zh: "稳定发展", en: "Stability" })] },
  ];

  // Recent conversations from actual history
  const recentSessions = hydrated ? sessions.slice(0, 2) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-8 md:py-12 md:pb-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-bold text-brand-900 mb-1">
          {tr({ zh: "成长追踪", en: "Growth Tracking" })}
        </h1>
        <p className="text-sm text-slate-500">
          {tr({ zh: "从校园到职场的持续陪伴，看见自己的成长轨迹", en: "Continuous companionship from campus to career, see your growth trajectory" })}
        </p>
      </div>

      {/* Stats - clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const content = (
            <div className={`card ${stat.link ? "cursor-pointer hover:border-brand-200 transition-colors" : ""}`}>
              <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg}`}>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-brand-900">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          );
          return stat.link ? (
            <Link key={stat.label} href={stat.link}>
              {content}
            </Link>
          ) : (
            <div key={stat.label}>{content}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Career interests */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-brand-500" />
            <h2 className="font-serif text-base font-bold text-brand-900">
              {tr({ zh: "职业方向匹配", en: "Career Direction Match" })}
            </h2>
          </div>
          <div className="space-y-4">
            {careerInterests.map((interest) => (
              <div key={interest.name}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{interest.name}</span>
                  <span className="text-sm font-bold text-brand-500">{interest.match}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-400 to-sage-400 transition-all duration-500"
                    style={{ width: `${interest.match}%` }}
                  />
                </div>
                <div className="mt-1 flex gap-1.5">
                  {interest.tags.map((tag) => (
                    <span key={tag} className="text-xs text-slate-400">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Milestones */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-sage-500" />
              <h2 className="font-serif text-base font-bold text-brand-900">
                {tr({ zh: "成长里程碑", en: "Growth Milestones" })}
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {trFmt({ zh: "{done}/{total} 完成", en: "{done}/{total} completed" }, { done: 2, total: 5 })}
            </span>
          </div>
          <div className="space-y-3">
            {milestones.map((milestone, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    milestone.status === "completed"
                      ? "bg-sage-100 text-sage-600"
                      : milestone.status === "in_progress"
                      ? "bg-sand-100 text-sand-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {milestone.status === "completed" ? "✓" : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      milestone.status === "completed"
                        ? "text-slate-400 line-through"
                        : "text-slate-700"
                    }`}
                  >
                    {milestone.title}
                  </p>
                  <p className="text-xs text-slate-400">{milestone.description}</p>
                  {milestone.date && (
                    <p className="text-xs text-slate-300 mt-0.5">{milestone.date}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent conversations - clickable, links to /history */}
      <div className="mt-6 card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-brand-500" />
            <h2 className="font-serif text-base font-bold text-brand-900">
              {tr({ zh: "最近对话", en: "Recent Conversations" })}
            </h2>
          </div>
          <Link
            href="/history"
            className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600"
          >
            {tr({ zh: "查看全部", en: "View All" })}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {hydrated && recentSessions.length > 0 ? (
          <div className="space-y-3">
            {recentSessions.map((session) => (
              <Link
                key={session.id}
                href={`/history/${session.id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:border-brand-200 transition-colors"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    session.mentorId === "general" ? "bg-brand-50" : "bg-sand-50"
                  }`}
                >
                  {session.mentorId === "general" ? (
                    <MessageCircle className="h-4 w-4 text-brand-500" />
                  ) : (
                    <Users className="h-4 w-4 text-sand-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{session.title}</p>
                  <p className="text-xs text-slate-400">
                    {session.mentorName} · {formatRelativeTime(session.updatedAt, lang)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
                <MessageCircle className="h-4 w-4 text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {tr({ zh: "和 AI 职导聊了 AI 方向和产品的选择", en: "Chatted with AI guider about AI direction and product choice" })}
                </p>
                <p className="text-xs text-slate-400">{tr({ zh: "2 小时前", en: "2h ago" })}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sand-50">
                <Users className="h-4 w-4 text-sand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {tr({ zh: "和 Lydia 聊了面试技巧和简历准备", en: "Chatted with Lydia about interview skills and resume prep" })}
                </p>
                <p className="text-xs text-slate-400">{tr({ zh: "今天", en: "Today" })}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </div>
          </div>
        )}

        <Link
          href="/chat"
          className="mt-4 flex items-center justify-center gap-1 text-sm text-brand-500 hover:text-brand-600 hover:underline"
        >
          <Sprout className="h-3 w-3" />
          {tr({ zh: "开始新的对话", en: "Start a new conversation" })} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
