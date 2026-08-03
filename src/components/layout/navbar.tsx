"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Compass, Users, LayoutDashboard, MessageCircle, History, LogIn, UserPlus, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/auth-modal";
import { PaymentModal } from "@/components/auth/payment-modal";

export function Navbar() {
  const pathname = usePathname();
  const { tr } = useI18n();
  const { isAuthenticated, user, logout, isPremium, upgradeToPremium } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [pendingPremium, setPendingPremium] = useState(false);

  const navItems = [
    { href: "/", label: tr({ zh: "首页", en: "Home" }), icon: Compass },
    { href: "/chat", label: tr({ zh: "AI职导", en: "AI Guider" }), icon: MessageCircle },
    { href: "/mentor", label: tr({ zh: "行业导师", en: "Mentors" }), icon: Users },
    { href: "/dashboard", label: tr({ zh: "成长追踪", en: "Growth" }), icon: LayoutDashboard },
    { href: "/history", label: tr({ zh: "对话记录", en: "History" }), icon: History },
  ];

  const handleLogin = () => {
    setAuthMode("login");
    setAuthOpen(true);
  };

  const handleRegister = () => {
    setAuthMode("register");
    setAuthOpen(true);
  };

  const handlePremium = () => {
    if (!isAuthenticated) {
      setPendingPremium(true);
      setAuthMode("login");
      setAuthOpen(true);
    } else {
      setPremiumOpen(true);
    }
  };

  const handleAuthSuccess = () => {
    if (pendingPremium) {
      setPendingPremium(false);
      setPremiumOpen(true);
    }
  };

  return (
    <>
      {/* ===== Mobile Top Nav (icon + label only) ===== */}
      <nav className="glass-nav sticky top-0 z-50 md:hidden">
        <div className="flex items-center justify-around px-1 py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-brand-500" : "text-slate-400"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ===== Desktop Top Nav (logo + center links + right buttons) ===== */}
      <nav className="glass-nav sticky top-0 z-50 hidden md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image
              src="/images/logo.png"
              alt="Career Companion Logo"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <div className="hidden sm:flex flex-col leading-none">
              <Image
                src="/images/logo-words.png"
                alt="Career Companion"
                width={120}
                height={18}
                className="h-3.5 w-auto object-contain"
                priority
              />
              <span className="text-[9px] font-medium text-sage-600 mt-0.5">
                Navigate Around Any Singularity, Shape Your Future
              </span>
            </div>
          </Link>

          {/* Center: Nav links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-brand-50 text-brand-600"
                      : "text-slate-500 hover:bg-slate-50 hover:text-brand-600"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Right: Auth buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isAuthenticated ? (
              <>
                <span className="hidden lg:inline text-xs text-slate-400">
                  {user?.account}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs font-medium text-slate-400 transition-colors hover:text-brand-600"
                >
                  {tr({ zh: "退出", en: "Logout" })}
                </button>
                {isPremium ? (
                  <span className="flex items-center gap-1 rounded-xl border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm font-medium text-sand-700">
                    <Crown className="h-4 w-4" />
                    <span className="hidden lg:inline">{tr({ zh: "已入会", en: "Premium" })}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handlePremium}
                    className="flex items-center gap-1.5 rounded-xl border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm font-medium text-sand-700 shadow-sm transition-all hover:bg-sand-100"
                    title={tr({ zh: "入会", en: "Premium" })}
                  >
                    <Crown className="h-4 w-4" />
                    <span>{tr({ zh: "入会", en: "Premium" })}</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleLogin}
                  className="hidden sm:flex items-center gap-1.5 rounded-xl border border-sage-300 bg-sage-50 px-3 py-1.5 text-sm font-medium text-sage-700 shadow-sm transition-all hover:bg-sage-100"
                  title={tr({ zh: "登录", en: "Login" })}
                >
                  <LogIn className="h-4 w-4" />
                  <span className="hidden lg:inline">{tr({ zh: "登录", en: "Login" })}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRegister}
                  className="hidden sm:flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95"
                  title={tr({ zh: "注册", en: "Sign Up" })}
                >
                  <UserPlus className="h-4 w-4" />
                  <span className="hidden lg:inline">{tr({ zh: "注册", en: "Sign Up" })}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePremium}
                  className="hidden xl:flex items-center gap-1.5 rounded-xl border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm font-medium text-sand-700 shadow-sm transition-all hover:bg-sand-100"
                  title={tr({ zh: "入会", en: "Premium" })}
                >
                  <Crown className="h-4 w-4" />
                  <span>{tr({ zh: "入会", en: "Premium" })}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Modals */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
        onSuccess={handleAuthSuccess}
      />
      <PaymentModal
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
        isMembership={true}
        onSuccess={() => {
          upgradeToPremium();
          setPremiumOpen(false);
        }}
      />
    </>
  );
}
