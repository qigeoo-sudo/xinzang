"use client";

import { useState, useEffect } from "react";
import { X, Smartphone, Mail, ChevronRight, CheckCircle2, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: "login" | "register";
}

export function AuthModal({ open, onClose, onSuccess, initialMode = "login" }: AuthModalProps) {
  const { tr } = useI18n();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setMethod("phone");
      setAccount("");
      setCode("");
      setPassword("");
      setCountdown(0);
      setLoading(false);
      setEmailSent(false);
      setError("");
      setCodeSent(false);
    }
  }, [open, initialMode]);

  // Countdown timer for SMS code
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  if (!open) return null;

  const handleSendCode = () => {
    if (method === "phone" && account.length < 6) {
      setError(tr({ zh: "请输入正确的手机号", en: "Please enter a valid phone number" }));
      return;
    }
    if (method === "email" && !account.includes("@")) {
      setError(tr({ zh: "请输入正确的邮箱", en: "Please enter a valid email" }));
      return;
    }
    setError("");
    setCountdown(60);
    setCodeSent(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (method === "phone") {
      if (code.length < 4) {
        setError(tr({ zh: "请输入验证码", en: "Please enter the verification code" }));
        return;
      }
    } else {
      if (password.length < 6) {
        setError(tr({ zh: "密码至少6位", en: "Password must be at least 6 characters" }));
        return;
      }
      if (mode === "register" && !emailSent) {
        setError(tr({ zh: "请先点击发送确认邮件", en: "Please send confirmation email first" }));
        return;
      }
    }

    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      if (mode === "login") {
        login(account, method);
      } else {
        register(account, method);
      }
      onSuccess?.();
      onClose();
    }, 800);
  };

  const handleSendEmail = () => {
    if (!account.includes("@")) {
      setError(tr({ zh: "请输入正确的邮箱", en: "Please enter a valid email" }));
      return;
    }
    setError("");
    setEmailSent(true);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-t-3xl md:rounded-3xl bg-white shadow-2xl animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-serif text-lg font-bold text-brand-900">
            {mode === "login"
              ? tr({ zh: "登录", en: "Login" })
              : tr({ zh: "注册", en: "Sign Up" })}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex gap-1 px-6 pb-4">
          <button
            onClick={() => setMode("login")}
            className={cn(
              "flex-1 rounded-xl py-2 text-sm font-medium transition-all",
              mode === "login"
                ? "bg-brand-50 text-brand-600"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            {tr({ zh: "登录", en: "Login" })}
          </button>
          <button
            onClick={() => setMode("register")}
            className={cn(
              "flex-1 rounded-xl py-2 text-sm font-medium transition-all",
              mode === "register"
                ? "bg-brand-50 text-brand-600"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            {tr({ zh: "注册", en: "Sign Up" })}
          </button>
        </div>

        {/* Method switch */}
        <div className="flex gap-2 px-6 pb-4">
          <button
            onClick={() => { setMethod("phone"); setError(""); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              method === "phone"
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            {tr({ zh: "手机号", en: "Phone" })}
          </button>
          <button
            onClick={() => { setMethod("email"); setError(""); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              method === "email"
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            )}
          >
            <Mail className="h-3.5 w-3.5" />
            {tr({ zh: "邮箱", en: "Email" })}
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
          {/* Account input */}
          <div>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={method === "phone"
                ? tr({ zh: "手机号", en: "Phone number" })
                : tr({ zh: "邮箱地址", en: "Email address" })
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
            />
          </div>

          {/* Phone: verification code */}
          {method === "phone" && (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={tr({ zh: "短信验证码", en: "SMS code" })}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0}
                  className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs font-medium text-brand-600 transition-all hover:bg-brand-100 disabled:opacity-40"
                >
                  {countdown > 0
                    ? `${countdown}s`
                    : tr({ zh: "获取验证码", en: "Send code" })
                  }
                </button>
              </div>
              {codeSent && (
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-600">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  {tr({ zh: "演示模式：输入任意4位以上数字即可通过验证", en: "Demo mode: enter any 4+ digits to pass" })}
                </div>
              )}
            </>
          )}

          {/* Email: password */}
          {method === "email" && (
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr({ zh: "密码（任意6位字符）", en: "Password (any 6 characters)" })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
              />
            </div>
          )}

          {/* Email register: confirmation email */}
          {method === "email" && mode === "register" && (
            <div>
              {emailSent ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-xl bg-sage-50 px-4 py-2.5 text-xs text-sage-600">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {tr({ zh: "确认邮件已发送，请查收邮箱后点击注册", en: "Confirmation email sent. Please check your inbox then click Sign Up." })}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-600">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    {tr({ zh: "演示模式：无需真实邮件确认，可直接点击注册", en: "Demo mode: no real email needed, just click Sign Up" })}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600"
                >
                  {tr({ zh: "发送确认邮件 →", en: "Send confirmation email →" })}
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {mode === "login"
                  ? tr({ zh: "登录", en: "Login" })
                  : tr({ zh: "注册", en: "Sign Up" })
                }
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>

          {/* Switch hint */}
          <p className="text-center text-xs text-slate-400">
            {mode === "login"
              ? tr({ zh: "还没有账号？点击上方注册", en: "No account yet? Switch to Sign Up above" })
              : tr({ zh: "已有账号？点击上方登录", en: "Already have an account? Switch to Login above" })
            }
          </p>
        </form>
      </div>
    </div>
  );
}
