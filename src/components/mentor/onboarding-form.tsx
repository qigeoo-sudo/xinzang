"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function OnboardingForm() {
  const { tr } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [education, setEducation] = useState("");
  const [major, setMajor] = useState("");
  const [goal, setGoal] = useState("");

  const interests = [
    tr({ zh: "AI/机器学习", en: "AI/ML" }),
    tr({ zh: "产品设计", en: "Product Design" }),
    tr({ zh: "数据分析", en: "Data Analysis" }),
    tr({ zh: "市场营销", en: "Marketing" }),
    tr({ zh: "人力资源", en: "Human Resources" }),
    tr({ zh: "金融/投资", en: "Finance/Investment" }),
    tr({ zh: "咨询", en: "Consulting" }),
    tr({ zh: "创业", en: "Entrepreneurship" }),
    tr({ zh: "编程/开发", en: "Engineering" }),
    tr({ zh: "运营", en: "Operations" }),
    tr({ zh: "品牌/创意", en: "Brand/Creative" }),
    tr({ zh: "医疗/健康", en: "Healthcare" }),
    tr({ zh: "教育", en: "Education" }),
    tr({ zh: "供应链", en: "Supply Chain" }),
    tr({ zh: "销售", en: "Sales" }),
  ];

  const educationOptions = [
    { value: "highschool", zh: "高中", en: "High School" },
    { value: "undergrad", zh: "本科在读", en: "Undergraduate (in progress)" },
    { value: "bachelor", zh: "本科毕业", en: "Bachelor's degree" },
    { value: "master_in", zh: "硕士在读", en: "Master's (in progress)" },
    { value: "master", zh: "硕士毕业", en: "Master's degree" },
    { value: "phd", zh: "博士", en: "PhD" },
  ];

  function toggleInterest(interest: string) {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  }

  function handleFinish() {
    // 保存到 localStorage（demo 阶段）
    localStorage.setItem("userProfile", JSON.stringify({
      education,
      major,
      interests: selectedInterests,
      goal,
    }));
    router.push("/chat");
  }

  return (
    <div className="card">
      {/* Progress */}
      <div className="mb-6 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-brand-600" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Education */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {tr({ zh: "你的学历", en: "Your Education" })}
            </label>
            <select
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white"
            >
              <option value="">{tr({ zh: "请选择", en: "Please select" })}</option>
              {educationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {tr({ zh: opt.zh, en: opt.en })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {tr({ zh: "你的专业", en: "Your Major" })}
            </label>
            <input
              type="text"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              placeholder={tr({
                zh: "如：计算机科学、市场营销、生物工程...",
                en: "e.g.: Computer Science, Marketing, Bioengineering...",
              })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
            />
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!education || !major}
            className="btn-primary w-full"
          >
            {tr({ zh: "下一步", en: "Next" })}
          </button>
        </div>
      )}

      {/* Step 2: Interests */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {tr({ zh: "你感兴趣的领域（可多选）", en: "Your Areas of Interest (multi-select)" })}
            </label>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedInterests.includes(interest)
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">
              {tr({ zh: "上一步", en: "Back" })}
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={selectedInterests.length === 0}
              className="btn-primary flex-1"
            >
              {tr({ zh: "下一步", en: "Next" })}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Goal */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {tr({ zh: "你现在最想解决的问题是什么？", en: "What's the biggest challenge you want to solve right now?" })}
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={4}
              placeholder={tr({
                zh: "比如：我快毕业了，不知道该选哪个方向；或者：我想转行但不确定适合做什么...",
                en: "e.g.: I'm graduating soon and not sure which direction to choose; or: I want to switch careers but don't know what fits me...",
              })}
              className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">
              {tr({ zh: "上一步", en: "Back" })}
            </button>
            <button onClick={handleFinish} className="btn-primary flex-1">
              <Sparkles className="h-4 w-4" />
              {tr({ zh: "开始对话", en: "Start Chatting" })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
