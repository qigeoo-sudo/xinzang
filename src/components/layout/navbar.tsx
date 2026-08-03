"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Users, LayoutDashboard, MessageCircle, History, LogIn, UserPlus, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function Navbar() {
  const pathname = usePathname();
  const { tr } = useI18n();

  const navItems = [
    { href: "/", label: tr({ zh: "首页", en: "Home" }), icon: Compass },
    { href: "/chat", label: tr({ zh: "AI职导", en: "AI Guider" }), icon: MessageCircle },
    { href: "/mentor", label: tr({ zh: "行业导师", en: "Mentors" }), icon: Users },
    { href: "/dashboard", label: tr({ zh: "成长追踪", en: "Growth" }), icon: LayoutDashboard },
    { href: "/history", label: tr({ zh: "对话记录", en: "History" }), icon: History },
  ];

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
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <polygon points="12,7 14,12 12,17 10,12" fill="white" stroke="none" />
              </svg>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-serif text-sm font-bold text-brand-800">
                Career Companion
              </span>
              <span className="text-[10px] font-medium text-sage-600">
                {tr({ zh: "你的 AI 职业伙伴", en: "Your AI Career Companion" })}
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
            <button
              type="button"
              className="hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-brand-600"
              title={tr({ zh: "登录", en: "Login" })}
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden lg:inline">{tr({ zh: "登录", en: "Login" })}</span>
            </button>

            <button
              type="button"
              className="hidden sm:flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95"
              title={tr({ zh: "注册", en: "Sign Up" })}
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden lg:inline">{tr({ zh: "注册", en: "Sign Up" })}</span>
            </button>

            <button
              type="button"
              className="hidden xl:flex items-center gap-1.5 rounded-xl border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm font-medium text-sand-700 shadow-sm transition-all hover:bg-sand-100"
              title={tr({ zh: "升级会员", en: "Go Premium" })}
            >
              <Crown className="h-4 w-4" />
              <span>{tr({ zh: "升级会员", en: "Premium" })}</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
