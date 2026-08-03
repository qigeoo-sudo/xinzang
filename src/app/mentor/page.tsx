"use client";

import Link from "next/link";
import { mentors } from "@/data/mentors";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { MentorAvatar } from "@/components/shared/mentor-avatar";
import { useI18n } from "@/lib/i18n";

export default function MentorListPage() {
  const { tr, trFmt } = useI18n();

  const industries = [
    tr({ zh: "全部", en: "All" }),
    tr({ zh: "医疗", en: "Healthcare" }),
    tr({ zh: "互联网", en: "Internet" }),
    tr({ zh: "金融", en: "Finance" }),
    tr({ zh: "咨询", en: "Consulting" }),
    tr({ zh: "科技", en: "Tech" }),
    tr({ zh: "消费", en: "Consumer" }),
    tr({ zh: "教育", en: "Education" }),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-8 md:py-12 md:pb-12">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-sage-50 px-3 py-1 text-xs font-medium text-sage-600 mb-3">
          <ShieldCheck className="h-3.5 w-3.5" />
          {tr({ zh: "真实访谈知识库", en: "Real Interview Knowledge Base" })}
        </div>
        <h1 className="font-serif text-2xl font-bold text-brand-900 mb-2">
          {tr({ zh: "行业导师 AI 分身", en: "Industry Veteran AI Avatars" })}
        </h1>
        <p className="text-sm text-slate-500">
          {tr({
            zh: "不是普通 AI 聊天机器人 — 核心资产是汇聚真实职业智慧的全球人脉网络",
            en: "Not just a chatbot — the core asset is a global network of real career wisdom",
          })}
        </p>
      </div>

      {/* Filter tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        {industries.map((industry, i) => (
          <button
            key={i}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
              i === 0
                ? "bg-brand-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600"
            }`}
          >
            {industry}
          </button>
        ))}
      </div>

      {/* Mentor grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mentors.map((mentor) => (
          <Link
            key={mentor.id}
            href={`/mentor/${mentor.id}`}
            className="card group relative overflow-hidden"
          >
            {/* Featured badge */}
            {mentor.featured && (
              <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-sand-50 px-2 py-0.5 text-xs font-medium text-sand-700">
                <Sparkles className="h-3 w-3" />
                {tr({ zh: "真实知识", en: "Real Knowledge" })}
              </div>
            )}

            {/* Avatar */}
            <div className="mb-4 flex items-center gap-3">
              <MentorAvatar name={mentor.name} avatar={mentor.avatar} size="md" />
              <div>
                <h3 className="font-bold text-brand-900">{mentor.name}</h3>
                <p className="text-xs text-slate-400">
                  {trFmt({ zh: "{years} 年经验", en: "{years}y experience" }, { years: mentor.years })}
                </p>
              </div>
              {mentor.available && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sage-50 px-2 py-0.5 text-xs font-medium text-sage-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-sage-400" />
                  {tr({ zh: "可对话", en: "Available" })}
                </span>
              )}
            </div>

            {/* Info */}
            <p className="text-sm text-slate-600 mb-2">
              {mentor.role} · {mentor.company_type}
            </p>
            <p className="text-sm text-slate-500 line-clamp-2 mb-3">{mentor.tagline}</p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {mentor.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-500"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Price & CTA */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-bold text-brand-500">
                {mentor.price === 0
                  ? tr({ zh: "免费体验", en: "Free Trial" })
                  : trFmt({ zh: "¥{price}/次", en: "¥{price}/chat" }, { price: mentor.price })}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400 group-hover:text-brand-500 transition-colors">
                {tr({ zh: "查看详情", en: "View Details" })} <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
