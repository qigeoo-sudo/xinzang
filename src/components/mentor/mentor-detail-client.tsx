"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { getMentorById } from "@/data/mentors";
import { MentorChat } from "@/components/mentor/mentor-chat";
import { MentorAvatar } from "@/components/shared/mentor-avatar";
import { Sparkles, Clock, Building2, Briefcase, CheckCircle2, ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/auth-modal";
import { PaymentModal } from "@/components/auth/payment-modal";

interface MentorDetailClientProps {
  id: string;
  session?: string;
}

export function MentorDetailClient({ id, session }: MentorDetailClientProps) {
  const { tr, trFmt } = useI18n();
  const { isAuthenticated, isMentorUnlocked, unlockMentor } = useAuth();
  const mentor = getMentorById(id);
  if (!mentor) notFound();

  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const PREVIEW_COUNT = 3;
  const hasMore = mentor.knowledge.length > PREVIEW_COUNT;
  const visibleKnowledge = knowledgeExpanded
    ? mentor.knowledge
    : mentor.knowledge.slice(0, PREVIEW_COUNT);

  // Check if this mentor is unlocked
  const isUnlocked = mentor.price === 0 || isMentorUnlocked(mentor.id);

  // Click price → check auth → show payment
  const handlePriceClick = () => {
    if (mentor.price === 0 || isUnlocked) return;
    if (isAuthenticated) {
      setPaymentOpen(true);
    } else {
      setAuthOpen(true);
    }
  };

  // After successful auth, open payment modal
  const handleAuthSuccess = () => {
    setPaymentOpen(true);
  };

  // After successful payment, unlock the mentor
  const handlePaymentSuccess = () => {
    unlockMentor(mentor.id);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-8 md:py-12 md:pb-12">
      {/* Mentor Profile Header */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row items-start gap-4">
          {/* Avatar */}
          <MentorAvatar name={mentor.name} avatar={mentor.avatar} size="xl" />

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-serif text-xl font-bold text-brand-900">{mentor.name}</h1>
              {mentor.featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sand-50 px-2 py-0.5 text-xs font-medium text-sand-700">
                  <Sparkles className="h-3 w-3" /> {tr({ zh: "真实知识库", en: "Real Knowledge Base" })}
                </span>
              )}
              {mentor.available && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 px-2 py-0.5 text-xs font-medium text-sage-600">
                  <CheckCircle2 className="h-3 w-3" /> {tr({ zh: "可对话", en: "Available" })}
                </span>
              )}
              {isUnlocked && mentor.price > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
                  <CheckCircle2 className="h-3 w-3" /> {tr({ zh: "已解锁", en: "Unlocked" })}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mb-3">{mentor.tagline}</p>

            {/* Meta info */}
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-slate-400" />
                {mentor.role}
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-slate-400" />
                {mentor.company_type}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" />
                {trFmt({ zh: "{years} 年经验", en: "{years} years experience" }, { years: mentor.years })}
              </span>
            </div>

            {/* Tags */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {mentor.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Price */}
          <div className="text-right">
            {mentor.price === 0 ? (
              <>
                <p className="text-2xl font-bold text-brand-500">
                  {tr({ zh: "免费", en: "Free" })}
                </p>
                <p className="text-xs text-slate-400">
                  {tr({ zh: "体验中", en: "In Trial" })}
                </p>
              </>
            ) : isUnlocked ? (
              <>
                <p className="text-2xl font-bold text-sage-500">
                  {tr({ zh: "已解锁", en: "Unlocked" })}
                </p>
                <p className="text-xs text-sage-400">
                  {tr({ zh: "可自由对话", en: "Chat freely" })}
                </p>
              </>
            ) : (
              <button
                onClick={handlePriceClick}
                className="group text-right transition-all hover:opacity-80 active:scale-95"
              >
                <p className="text-2xl font-bold text-brand-500 group-hover:text-brand-600">
                  ¥{mentor.price}
                </p>
                <p className="text-xs text-slate-400 group-hover:text-brand-400">
                  {tr({ zh: "点击付费解锁 →", en: "Click to unlock →" })}
                </p>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Knowledge preview */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-base font-bold text-brand-900">
            {tr({ zh: "导师知识领域", en: "Mentor Knowledge Areas" })}
          </h2>
          {hasMore && (
            <button
              onClick={() => setKnowledgeExpanded(!knowledgeExpanded)}
              className="flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600"
            >
              {knowledgeExpanded
                ? tr({ zh: "收起", en: "Collapse" })
                : tr({ zh: `展开全部 (${mentor.knowledge.length})`, en: `Show all (${mentor.knowledge.length})` })}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", knowledgeExpanded && "rotate-180")} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleKnowledge.map((entry, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-100 bg-slate-50 p-3"
            >
              <p className="text-xs font-medium text-brand-500 mb-1">{entry.category}</p>
              <p className="text-sm text-slate-600 line-clamp-2">{entry.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Interface — show if mentor is available AND unlocked (or free) */}
      {mentor.available ? (
        isUnlocked ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-base font-bold text-brand-900">
                {trFmt({ zh: "和 {name} 对话", en: "Chat with {name}" }, { name: mentor.name })}
              </h2>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <MentorChat
                mentorId={mentor.id}
                mentorName={mentor.name}
                mentorPersonality={mentor.personality_prompt}
                mentorAvatar={mentor.avatar}
                sessionId={session}
              />
            </div>
          </div>
        ) : (
          <div className="card text-center py-12 relative overflow-hidden">
            {/* Blurred preview hint */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <Lock className="h-32 w-32 text-brand-300" />
            </div>
            <div className="relative">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <Lock className="h-6 w-6 text-brand-400" />
              </div>
              <h3 className="font-bold text-brand-900 mb-1">
                {trFmt({ zh: "解锁与 {name} 的对话", en: "Unlock chat with {name}" }, { name: mentor.name })}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {tr({ zh: `支付 ¥${mentor.price} 即可开始与这位导师的深度对话`, en: `Pay ¥${mentor.price} to start a deep conversation with this mentor` })}
              </p>
              <button onClick={handlePriceClick} className="btn-primary">
                {tr({ zh: `立即解锁 ¥${mentor.price}`, en: `Unlock now ¥${mentor.price}` })}
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="card text-center py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Sparkles className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="font-bold text-brand-900 mb-1">
            {tr({ zh: "该导师即将上线", en: "Coming Soon" })}
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {trFmt(
              { zh: "{name} 的 AI 分身正在训练中，敬请期待", en: "{name}'s AI avatar is in training, stay tuned" },
              { name: mentor.name }
            )}
          </p>
          <button className="btn-secondary">
            {tr({ zh: "预约通知", en: "Notify Me" })}
          </button>
        </div>
      )}

      {/* Real person contact */}
      <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-brand-900 mb-1">
              {tr({ zh: "想和真人聊？", en: "Want to talk to a real person?" })}
            </h3>
            <p className="text-xs text-slate-500">
              {trFmt(
                { zh: "申请与 {name} 本人进行一对一交流", en: "Apply for a 1-on-1 with {name}" },
                { name: mentor.name }
              )}
            </p>
          </div>
          <button className="btn-primary text-xs px-4 py-2">
            {tr({ zh: "申请真人联系", en: "Request Real Contact" })}
          </button>
        </div>
      </div>

      {/* Auth & Payment Modals */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        mentorName={mentor.name}
        price={mentor.price}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
