"use client";

import OnboardingForm from "@/components/mentor/onboarding-form";
import { useI18n } from "@/lib/i18n";

export default function OnboardingPage() {
  const { tr } = useI18n();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-8 md:py-16 md:pb-16">
      <div className="text-center mb-8">
        <h1 className="font-serif text-2xl font-bold text-slate-800 mb-2">
          {tr({ zh: "让 AI 职导更懂你", en: "Help Your AI Guider Understand You" })}
        </h1>
        <p className="text-sm text-slate-500">
          {tr({
            zh: "填写以下信息，AI 职业导师会基于你的背景给出更精准的建议",
            en: "Fill in the info below, and your AI guider will give more tailored advice based on your background",
          })}
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
