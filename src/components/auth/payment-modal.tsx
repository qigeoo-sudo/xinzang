"use client";

import { useState } from "react";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  mentorName: string;
  price: number;
}

interface PaymentMethod {
  id: string;
  zh: string;
  en: string;
  icon: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "wechat", zh: "微信支付", en: "WeChat Pay", icon: "💚" },
  { id: "alipay", zh: "支付宝", en: "Alipay", icon: "🔵" },
  { id: "unionpay", zh: "银联", en: "UnionPay", icon: "🔴" },
  { id: "visa", zh: "Visa", en: "Visa", icon: "💳" },
  { id: "paypal", zh: "PayPal", en: "PayPal", icon: "🅿️" },
];

export function PaymentModal({ open, onClose, mentorName, price }: PaymentModalProps) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const handlePay = () => {
    if (!selected) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1500);
  };

  const handleClose = () => {
    setSuccess(false);
    setSelected("");
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-t-3xl md:rounded-3xl bg-white shadow-2xl animate-fade-in-up">
        {success ? (
          <div className="flex flex-col items-center px-6 py-10">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-100">
              <CheckCircle2 className="h-8 w-8 text-sage-500" />
            </div>
            <h2 className="font-serif text-lg font-bold text-brand-900 mb-1">
              {tr({ zh: "支付成功！", en: "Payment Successful!" })}
            </h2>
            <p className="text-sm text-slate-500 mb-6 text-center">
              {tr({ zh: "你已解锁与" + mentorName + "的对话", en: "You have unlocked chat with " + mentorName })}
            </p>
            <button onClick={handleClose} className="btn-primary w-full">
              {tr({ zh: "开始对话", en: "Start Chatting" })}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="font-serif text-lg font-bold text-brand-900">
                {tr({ zh: "确认支付", en: "Confirm Payment" })}
              </h2>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-6 mb-4 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-500">{tr({ zh: "导师", en: "Mentor" })}</span>
                <span className="text-sm font-medium text-brand-900">{mentorName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{tr({ zh: "金额", en: "Amount" })}</span>
                <span className="text-xl font-bold text-brand-500">¥{price}</span>
              </div>
            </div>

            <div className="px-6 pb-2">
              <p className="text-xs font-medium text-slate-400 mb-3">
                {tr({ zh: "选择支付方式", en: "Select payment method" })}
              </p>
              <div className="space-y-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelected(method.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                      selected === method.id
                        ? "border-brand-400 bg-brand-50 text-brand-700"
                        : "border-slate-100 bg-white text-slate-600 hover:border-slate-200"
                    )}
                  >
                    <span className="text-xl">{method.icon}</span>
                    <span className="flex-1 text-left">{tr({ zh: method.zh, en: method.en })}</span>
                    <div
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all",
                        selected === method.id ? "border-brand-500 bg-brand-500" : "border-slate-300"
                      )}
                    >
                      {selected === method.id && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 pb-6 pt-3">
              <button
                onClick={handlePay}
                disabled={!selected || loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tr({ zh: "支付中...", en: "Processing..." })}
                  </>
                ) : (
                  tr({ zh: "确认支付 ¥" + price, en: "Pay ¥" + price })
                )}
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                {tr({ zh: "支付后即可与导师开始对话", en: "Chat with mentor will unlock after payment" })}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
