"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Compass, Users, Sprout, ArrowRight, MessageCircle, LogIn, UserPlus, Crown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/auth-modal";
import { PaymentModal } from "@/components/auth/payment-modal";

export default function HomePage() {
  const { tr, lang, toggleLang } = useI18n();
  const { isAuthenticated, user, logout, isPremium, upgradeToPremium } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [premiumOpen, setPremiumOpen] = useState(false);

  const openLogin = () => {
    setAuthMode("login");
    setAuthOpen(true);
  };

  const openRegister = () => {
    setAuthMode("register");
    setAuthOpen(true);
  };

  const openPremium = () => {
    if (!isAuthenticated) {
      setAuthMode("login");
      setAuthOpen(true);
    } else {
      setPremiumOpen(true);
    }
  };

  return (
    <div className="bg-gradient-to-b from-brand-50 via-white to-sand-100 pb-8 md:pb-0">
      {/* Language Toggle — fixed top-right */}
      <button
        type="button"
        onClick={() => toggleLang()}
        className="fixed top-20 right-3 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-brand-300 bg-white/90 text-xs font-bold text-brand-700 shadow-md backdrop-blur-md transition-all hover:bg-brand-50 active:scale-90 md:top-20 md:right-6 md:h-10 md:w-10 md:text-sm"
        title={tr({ zh: "切换语言", en: "Switch language" })}
      >
        {lang === "zh" ? "CH" : "EN"}
      </button>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-mesh-gradient" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-20">
          <div className="text-center max-w-3xl mx-auto animate-fade-in-up">
            {/* Headline */}
            <h1 className="font-serif font-bold text-brand-900 mb-6">
              {lang === "zh" ? (
                <span className="flex flex-col items-center justify-center text-[40px] md:text-[40px] leading-none">
                  {[
                    { w: "每个", g: false, offset: 0 },
                    { w: "年轻人", g: false, offset: 2 },
                    { w: "的", g: false, offset: 5 },
                    { w: "AI", g: true, offset: 6 },
                    { w: "职业伙伴", g: true, offset: 8 },
                  ].map((word, i) => (
                    <span key={i} className="flex items-center justify-center">
                      {word.w.split("").map((ch, ci) => {
                        const globalIdx = word.offset + ci;
                        return (
                          <span
                            key={ci}
                            className={`animate-breathe ${word.g ? "bg-gradient-to-r from-brand-500 to-sage-500 bg-clip-text text-transparent" : ""}`}
                            style={{ animationDelay: `${globalIdx * 0.5}s, ${globalIdx * 1.0 + 12}s` }}
                          >
                            {ch}
                          </span>
                        );
                      })}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="block text-4xl md:text-5xl leading-tight">
                  {[
                    { w: "Every", g: false, br: false },
                    { w: "Young", g: false, br: false },
                    { w: "Person's", g: false, br: true },
                    { w: "AI", g: true, br: false },
                    { w: "Career", g: true, br: false },
                    { w: "Companion", g: true, br: false },
                  ].map((item, i) => (
                    <span key={i}>
                      <span
                        className={`animate-breathe ${item.g ? "bg-gradient-to-r from-brand-500 to-sage-500 bg-clip-text text-transparent" : ""}`}
                        style={{ animationDelay: `${i * 0.5}s, ${5.5 + i * 1.0}s` }}
                      >
                        {item.w}
                      </span>
                      {item.br ? <br /> : " "}
                    </span>
                  ))}
                </span>
              )}
            </h1>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/chat" className="btn-primary w-full sm:w-auto">
                <MessageCircle className="h-4 w-4" />
                {tr({ zh: "与AI职导对话", en: "Chat with AI Guider" })}
              </Link>
              <Link href="/mentor" className="btn-secondary w-full sm:w-auto">
                {tr({ zh: "浏览行业导师", en: "Browse Mentors" })}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-transparent py-8 md:py-12 border-y border-slate-100/50">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-sm text-slate-400 text-center mb-6">
            {tr({ zh: "三步开始你的职业探索之旅", en: "Three steps to start your career exploration" })}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Step 1 */}
            <div className="text-center relative">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white font-bold shadow-md shadow-brand-200">
                1
              </div>
              <h3 className="font-bold text-brand-900 mb-1.5">
                {tr({ zh: "和 AI 职导聊天", en: "Chat with AI Guider" })}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tr({ zh: "说出你的困惑，AI 职导通过提问帮你理清自己", en: "Share your concerns, the AI guider helps you think clearly through questions" })}
              </p>
              <div className="hidden md:block absolute top-6 left-[60%] w-full">
                <div className="h-px bg-gradient-to-r from-brand-200 to-sage-200" />
              </div>
            </div>
            {/* Step 2 */}
            <div className="text-center relative">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-400 text-white font-bold shadow-md shadow-sage-200">
                2
              </div>
              <h3 className="font-bold text-brand-900 mb-1.5">
                {tr({ zh: "选行业导师对话", en: "Talk to Industry Veterans" })}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tr({ zh: "AI 职导帮你引荐，找到匹配的行业导师深入聊", en: "The AI guider refers you to matching industry veterans for deeper conversations" })}
              </p>
              <div className="hidden md:block absolute top-6 left-[60%] w-full">
                <div className="h-px bg-gradient-to-r from-sage-200 to-sand-200" />
              </div>
            </div>
            {/* Step 3 */}
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sand-500 text-white font-bold shadow-md shadow-sand-200">
                3
              </div>
              <h3 className="font-bold text-brand-900 mb-1.5">
                {tr({ zh: "追踪你的成长", en: "Track Your Growth" })}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tr({ zh: "每次对话都在积累，看见自己的变化轨迹", en: "Every conversation adds up — see your transformation over time" })}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div className="card group">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 transition-colors group-hover:bg-brand-100">
              <Compass className="h-6 w-6 text-brand-500" />
            </div>
            <h3 className="font-serif text-lg font-bold text-brand-900 mb-2">
              {tr({ zh: "智能引导", en: "Smart Guidance" })}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              {tr({
                zh: "AI 职导不给你标准答案，而是通过提问帮你理清方向。知道自己是谁，比选对赛道更重要。",
                en: "Your AI guider doesn't give standard answers — it asks questions to help you find clarity. Knowing who you are matters more than choosing the right track.",
              })}
            </p>
          </div>

          <div className="card group">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sage-50 transition-colors group-hover:bg-sage-100">
              <Users className="h-6 w-6 text-sage-500" />
            </div>
            <h3 className="font-serif text-lg font-bold text-brand-900 mb-2">
              {tr({ zh: "真实连接", en: "Real Connections" })}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              {tr({
                zh: "行业导师 AI 分身，拥有真实访谈知识库。不是泛泛而谈，而是来自一线的实战洞察。",
                en: "Industry veteran AI avatars with real interview knowledge bases. Not generic advice, but frontline insights from the trenches.",
              })}
            </p>
          </div>

          <div className="card group">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sand-50 transition-colors group-hover:bg-sand-100">
              <Sprout className="h-6 w-6 text-sand-600" />
            </div>
            <h3 className="font-serif text-lg font-bold text-brand-900 mb-2">
              {tr({ zh: "温暖陪伴", en: "Warm Companionship" })}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              {tr({
                zh: "AI + 真实人脉 + 成长追踪，三层陪伴体系。从迷茫到清晰，每一步都被看见。",
                en: "AI + real network + growth tracking. Three layers of support. From confusion to clarity, every step is seen.",
              })}
            </p>
          </div>
        </div>
      </section>

      {/* Brand & Auth Card */}
      <section className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <div className="card-warm flex flex-col items-center gap-5">
          {/* Auth buttons — top row */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-xs text-slate-500">
                {tr({ zh: `已登录: ${user?.account}`, en: `Logged in: ${user?.account}` })}
              </span>
              <button
                onClick={logout}
                className="text-xs font-medium text-slate-400 transition-colors hover:text-brand-600"
              >
                {tr({ zh: "退出", en: "Logout" })}
              </button>
              {isPremium ? (
                <span className="flex items-center gap-1.5 rounded-xl border border-sand-300 bg-gradient-to-r from-sand-50 to-amber-50 px-4 py-1.5 text-xs font-medium text-sand-700 shadow-sm">
                  <Crown className="h-4 w-4" />
                  {tr({ zh: "已入会", en: "Premium Member" })}
                </span>
              ) : (
                <button
                  onClick={openPremium}
                  className="flex items-center gap-1.5 rounded-xl border border-sand-300 bg-sand-50 px-4 py-1.5 text-xs font-medium text-sand-700 shadow-sm transition-all hover:bg-sand-100"
                >
                  <Crown className="h-4 w-4" />
                  {tr({ zh: "入会", en: "Premium" })}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 justify-center w-full">
              <button
                onClick={openRegister}
                className="flex items-center gap-1 rounded-xl bg-brand-500 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95 whitespace-nowrap"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {tr({ zh: "注册", en: "Sign Up" })}
              </button>
              <button
                onClick={openLogin}
                className="flex items-center gap-1 rounded-xl border border-sage-300 bg-sage-50 px-2.5 py-1.5 text-[11px] font-medium text-sage-700 shadow-sm transition-all hover:bg-sage-100 whitespace-nowrap"
              >
                <LogIn className="h-3.5 w-3.5" />
                {tr({ zh: "登录", en: "Login" })}
              </button>
              <button
                onClick={openPremium}
                className="flex items-center gap-1 rounded-xl border border-sand-300 bg-sand-50 px-2.5 py-1.5 text-[11px] font-medium text-sand-700 shadow-sm transition-all hover:bg-sand-100 whitespace-nowrap"
              >
                <Crown className="h-3.5 w-3.5" />
                {tr({ zh: "入会", en: "Premium" })}
              </button>
            </div>
          )}

          {/* Full logo — bottom */}
          <Image
            src="/images/logo-full.png"
            alt="Career Companion"
            width={380}
            height={143}
            className="w-full max-w-[19rem] md:max-w-[28.5rem] h-auto object-contain"
            priority
          />
        </div>
      </section>

      {/* Auth Modal */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
        onSuccess={() => {
          // If user was trying to upgrade premium, open premium modal after auth
          if (premiumOpen) {
            setPremiumOpen(true);
          }
        }}
      />

      {/* Premium Payment Modal */}
      <PaymentModal
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
        isMembership={true}
        onSuccess={() => {
          upgradeToPremium();
          setPremiumOpen(false);
        }}
      />
    </div>
  );
}
