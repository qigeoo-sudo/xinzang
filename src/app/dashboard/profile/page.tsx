'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { PaperCredits, GoldFlakes, PageHero } from '@/components/page-shell';
import { AssessmentSummary } from '@/components/assessment/assessment-summary';
import { RecommendedMentors } from '@/components/recommended-mentors';
import {
  MAJOR_OPTIONS,
  CAREER_OPTIONS,
  WORK_EXP_DURATION_OPTIONS,
} from '@/lib/register-options';

// JSON 数组字符串解析辅助
function parseJsonArray(str: string | null | undefined): string[] {
  if (!str) return [];
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 注册档案字段（GET /api/user/profile 返回的 profile 里这里只用到这些）
interface ProfileData {
  nickname?: string | null;
  status?: string | null;
  school?: string | null;
  major?: string | null;
  birthMonth?: string | null;
  enrollMonth?: string | null;
  expectedGrad?: string | null;
  gradMonth?: string | null;
  workGoal?: string | null;
  fullTimeExp?: string | null;
  partTimeExp?: string | null;
  workProvince?: string | null;
  workCity?: string | null;
  curProvince?: string | null;
  curCity?: string | null;
  careers?: string | null;
  customCareerDirections?: string | null;
  careerAnxiety?: string | null;
  helpPriority?: string | null;
  mentorPreference?: string | null;
  contactEmail?: string | null;
}

// GET /api/user/profile 返回的测评（scores 已在服务端 parse）
interface AssessmentView {
  code?: string | null;
  scores: Record<'R' | 'I' | 'A' | 'S' | 'E' | 'C', number>;
  takenAt?: string;
  explanation?: string | null;
  recommendedJobs?: string | null;
}

// 注册档案年月字段展示
function fmtMonthView(v?: string | null): string {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return '—';
  const [y, m] = v.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

function fmtTakenAt(v?: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日测试`;
}

// 页面底色 — 在职淡绿、待业淡橙、在校/未知淡沙
function getTemplateBg(status?: string | null): string {
  if (status === '在职') return 'bg-sage-25';
  if (status === '待业') return 'bg-brand-25';
  return 'bg-sand-25';
}

export default function ProfilePage() {
  const { status, update } = useSession();
  const router = useRouter();

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [initialProfile, setInitialProfile] = useState<ProfileData | null>(null);
  const [assessment, setAssessment] = useState<AssessmentView | null>(null);
  const [phone, setPhone] = useState('');
  // 清空全部数据流程：b1 第一次确认 → b2 再次确认 → 执行
  const [clearStep, setClearStep] = useState<'none' | 'b1' | 'b2'>('none');
  const [clearError, setClearError] = useState('');

  // 加载用户档案 + 测评结果
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/user/profile', { cache: 'no-store' })
      .then((res) => res.json())
      .then(
        (data: {
          profile?: ProfileData;
          assessment?: AssessmentView | null;
          phone?: string | null;
        }) => {
          if (cancelled) return;
          setInitialProfile(data.profile ?? null);
          setAssessment(data.assessment ?? null);
          setPhone(data.phone ?? '');
          setProfileLoaded(true);
        }
      )
      .catch(() => {
        if (!cancelled) setProfileLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // 未登录重定向（二次确认防误杀）：
  // next-auth 客户端在 /api/auth/session 遇到冷启动 5xx / 网络抖动时会吞掉错误返回 null，
  // status 会瞬时变成 unauthenticated；直连复核一次，确认真没登录才跳登录页。
  useEffect(() => {
    if (status !== 'unauthenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.user?.id) {
            // 其实还登录着：纠正客户端的假阴性状态，后续加载 effect 会自动继续
            await update();
            return;
          }
        }
        if (!cancelled) router.push('/login?callbackUrl=/dashboard/profile');
      } catch {
        // 复核请求本身失败（网络/冷启动）：停在加载态，绝不把用户踢去登录页
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, router, update]);

  // 清空全部数据（聊天记录 + 档案 + 测评 + 本地缓存），成功后返回首页
  const handleClearAll = async () => {
    try {
      const res = await fetch('/api/profile/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setClearStep('none');
        setClearError(data.error || '清空失败，请稍后再试');
        return;
      }
      // 清除聊天相关本地缓存，避免旧对话被前端恢复
      try {
        const lsKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('chat-')) lsKeys.push(key);
        }
        lsKeys.forEach((key) => localStorage.removeItem(key));
        const ssKeys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('chat-input-')) ssKeys.push(key);
        }
        ssKeys.forEach((key) => sessionStorage.removeItem(key));
      } catch {
        // 本地缓存清理失败不影响清空结果
      }
      router.push('/');
      router.refresh();
    } catch {
      setClearStep('none');
      setClearError('网络错误，请稍后再试');
    }
  };

  if (status === 'loading' || !profileLoaded) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative min-h-screen flex flex-col cream-foil overflow-hidden ${getTemplateBg(initialProfile?.status)}`}>
      <Header />
      <GoldFlakes />

      <PageHero
        eyebrow="MY PROFILE"
        title="我的档案"
        subtitle="注册资料、测试结果、成长追踪都在这儿。"
        watermark="档"
      />

      <div className="relative z-10 page-container flex-1">
        {clearError && <p className="mb-4 text-xs text-danger">{clearError}</p>}

        {/* 主操作：改资料 / 成长追踪 / 清空（三等分，始终一行） */}
        <div className="flex gap-2 sm:gap-3 mb-6">
          <Link
            href="/dashboard/profile/edit"
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-[10px] bg-brand-500 px-2 sm:px-4 py-2.5 text-[13px] sm:text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[.98]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            修改档案
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-[10px] bg-sage-400 px-2 sm:px-4 py-2.5 text-[13px] sm:text-sm font-semibold text-white transition-all hover:bg-sage-500 active:scale-[.98]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
            成长追踪
          </Link>
          <button
            type="button"
            onClick={() => {
              setClearError('');
              setClearStep('b1');
            }}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-[10px] bg-sand-500 px-2 sm:px-4 py-2.5 text-[13px] sm:text-sm font-semibold text-white transition-all hover:bg-sand-600 active:scale-[.98]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            清空资料
          </button>
        </div>

        {/* 注册档案聚合：账号 / 状态教育 / 方向地点 */}
        <ProfileSections profile={initialProfile} phone={phone} />

        {/* 职业兴趣测试结果 + 解读（合并为同一张卡片） */}
        {assessment ? (
          <div className="letter-paper rounded-[20px] mb-4 p-5 md:p-6">
            <AssessmentSummary assessment={assessment} takenAtLabel={fmtTakenAt(assessment.takenAt)} />

            {/* 兴趣代码解读（LLM 生成）+ 推荐探索方向 */}
            {assessment.explanation && (
              <div className="mt-5 rounded-2xl border border-sage-300/60 bg-gradient-to-br from-sage-50 to-amber-50/60 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-[12px]">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>
                  </span>
                  <h3 className="text-sm font-bold text-sage-800">兴趣代码解读 · 推荐方向</h3>
                </div>
                <p className="text-sm leading-7 text-ink/90">{assessment.explanation}</p>

                {parseJsonArray(assessment.recommendedJobs).length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold text-sage-700">可能你会对以下职业感兴趣：</p>
                    <div className="flex flex-wrap gap-2">
                      {parseJsonArray(assessment.recommendedJobs).map((j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-sage-800 shadow-sm ring-1 ring-sage-200"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-sage-400" />
                          {j}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-4 text-[11px] leading-5 text-muted/70">
                  以上解读由 AI 基于你的兴趣代码生成，仅作职业方向参考，不构成定论。
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="letter-paper rounded-[20px] mb-4 p-5 md:p-6 flex flex-col items-start gap-2">
            <h2 className="text-sm font-semibold text-ink">职业兴趣测试</h2>
            <p className="text-sm text-muted">
              还没有测试结果。测一测霍兰德六维兴趣代码，结果会存进这份档案，也能帮导师更快懂你。
            </p>
            <Link
              href="/assessment"
              className="mt-1 inline-flex items-center rounded-[10px] bg-sage-400 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-sage-500"
            >
              做职业兴趣测试 →
            </Link>
          </div>
        )}

        {/* 推荐导师 */}
        <RecommendedMentors profile={initialProfile} showAssessmentHint={!assessment} />

        {/* 清空 — 第一次确认 */}
        {clearStep === 'b1' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
            onClick={() => setClearStep('none')}
          >
            <div
              className="relative overflow-hidden bg-bg cream-foil rounded-2xl px-6 py-7 mx-4 max-w-[320px] w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink/10 text-ink">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </div>
                <h3 className="font-serif text-lg font-bold text-ink leading-none">确认清空</h3>
                <p className="mt-2.5 mb-5 text-[13px] leading-relaxed text-muted">
                  此操作不可撤销，它会清空所有你的聊天记录，所有和职业有关的数据库信息，导师分身将不再记得你。
                </p>
                <div className="flex w-full gap-3">
                  <button
                    type="button"
                    onClick={() => setClearStep('none')}
                    className="flex-1 rounded-[10px] border border-rule bg-white/70 py-2.5 text-sm font-semibold text-ink transition-all hover:bg-sand-25 active:scale-[.98]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => setClearStep('b2')}
                    className="flex-1 rounded-[10px] bg-ink py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[.98]"
                  >
                    确认清空
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 清空 — 再次确认 */}
        {clearStep === 'b2' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
            onClick={() => setClearStep('none')}
          >
            <div
              className="relative overflow-hidden bg-bg cream-foil rounded-2xl px-6 py-7 mx-4 max-w-[320px] w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink/10 text-ink">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <p className="font-mono text-[10px] font-medium uppercase tracking-masthead text-ink/70">Final Confirm</p>
                <h3 className="mt-1 font-serif text-lg font-bold text-ink leading-none">再次确认</h3>
                <p className="mt-2.5 mb-5 text-[13px] leading-relaxed text-muted">
                  慎重起见，请再次确认。
                </p>
                <div className="flex w-full gap-3">
                  <button
                    type="button"
                    onClick={() => setClearStep('none')}
                    className="flex-1 rounded-[10px] border border-rule bg-white/70 py-2.5 text-sm font-semibold text-ink transition-all hover:bg-sand-25 active:scale-[.98]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="flex-1 rounded-[10px] bg-ink py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[.98]"
                  >
                    确认清空
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <PaperCredits lang="zh" />
    </div>
  );
}

// ============================================================
// register-v2 注册档案聚合展示（只读，编辑走 /dashboard/profile/edit）
// ============================================================

const optionLabel = (opts: { value: string; label: string }[], v?: string | null) =>
  (v && opts.find((o) => o.value === v)?.label) || v || '—';

function ProfileSections({ profile, phone }: { profile: ProfileData | null; phone: string }) {
  const p = profile;
  const isStudent = p?.status === '在校';

  const accountRows: [string, string][] = [
    ['手机号', phone || '—'],
    ['姓名 / 昵称', p?.nickname || '—'],
    ['出生年月', fmtMonthView(p?.birthMonth)],
  ];

  const schoolRows: [string, string][] = isStudent
    ? [
        ['目前状态', '在校'],
        ['入学年月', fmtMonthView(p?.enrollMonth)],
        ['学校', p?.school || '—'],
        ['专业分类', optionLabel(MAJOR_OPTIONS, p?.major)],
        ['毕业日期', fmtMonthView(p?.expectedGrad)],
      ]
    : [
        ['目前状态', p?.status || '—'],
        ['学校', p?.school || '—'],
        ['专业分类', optionLabel(MAJOR_OPTIONS, p?.major)],
        ['毕业日期', fmtMonthView(p?.gradMonth)],
        ['全职经验', p?.fullTimeExp ? optionLabel(WORK_EXP_DURATION_OPTIONS, p.fullTimeExp) : '未填'],
        ['兼职经验', p?.partTimeExp ? optionLabel(WORK_EXP_DURATION_OPTIONS, p.partTimeExp) : '未填'],
      ];

  const careerNames = [
    ...parseJsonArray(p?.careers).map((v) => CAREER_OPTIONS.find((o) => o.value === v)?.label ?? v),
    ...parseJsonArray(p?.customCareerDirections),
  ].join('、');
  const locationRows: [string, string][] = [
    ['希望工作地点', p?.workProvince ? `${p.workProvince}${p.workCity ? ` · ${p.workCity}` : ''}` : '—'],
    ['目前所在地', p?.curProvince ? `${p.curProvince}${p.curCity ? ` · ${p.curCity}` : ''}` : '—'],
    ['感兴趣的职业方向', careerNames || '—'],
  ];

  // “让导师分身更懂你”选填内容：未填则整张卡不显示
  const hintRows: [string, string][] = [];
  if (p?.careerAnxiety?.trim()) hintRows.push(['当前最大焦虑', p.careerAnxiety.trim()]);
  const helpPriorities = parseJsonArray(p?.helpPriority);
  if (helpPriorities.length) hintRows.push(['希望获得的帮助', helpPriorities.join('、')]);
  const mentorPrefs = parseJsonArray(p?.mentorPreference);
  if (mentorPrefs.length) hintRows.push(['想深聊的人', mentorPrefs.join('、')]);

  return (
    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <InfoCard title="账号信息" rows={accountRows} />
      <InfoCard title={isStudent ? '在校信息' : p?.status === '待业' ? '待业信息' : '在职信息'} rows={schoolRows} />
      <InfoCard title="方向与地点" rows={locationRows} className="md:col-span-2" />
      {hintRows.length > 0 && (
        <InfoCard title="让导师分身更懂你" rows={hintRows} className="md:col-span-2" />
      )}
      {p?.contactEmail?.trim() && (
        <InfoCard title="联系邮箱" rows={[['Email', p.contactEmail.trim()]]} className="md:col-span-2" />
      )}
    </div>
  );
}

function InfoCard({ title, rows, className = '' }: { title: string; rows: [string, string][]; className?: string }) {
  return (
    <div className={`letter-paper rounded-[20px] p-5 md:p-6 ${className}`}>
      <h2 className="mb-3 border-b border-rule/40 pb-2 text-sm font-semibold text-ink">{title}</h2>
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[13px] leading-relaxed">
            <dt className="w-[96px] shrink-0 whitespace-nowrap text-muted">{k}</dt>
            <dd className="flex-1 text-ink">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}


