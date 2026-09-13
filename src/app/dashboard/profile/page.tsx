'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { HomeFooter } from '@/components/home/home-footer';
import { AssessmentSummary } from '@/components/assessment/assessment-summary';
import {
  MAJOR_OPTIONS,
  CAREER_OPTIONS,
  WORK_GOAL_WORKING,
  WORK_GOAL_JOBLESS,
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
}

// GET /api/user/profile 返回的测评（scores 已在服务端 parse）
interface AssessmentView {
  code?: string | null;
  scores: Record<'R' | 'I' | 'A' | 'S' | 'E' | 'C', number>;
  takenAt?: string;
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
  const { status } = useSession();
  const router = useRouter();

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [initialProfile, setInitialProfile] = useState<ProfileData | null>(null);
  const [assessment, setAssessment] = useState<AssessmentView | null>(null);
  const [phone, setPhone] = useState('');

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

  // 未登录重定向
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/dashboard/profile');
    }
  }, [status, router]);

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
    <div className={`min-h-screen flex flex-col ${getTemplateBg(initialProfile?.status)}`}>
      <Header />

      <div className="page-container flex-1">
        {/* 标题 */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-ink">我的档案</h1>
          <p className="text-sm text-muted mt-1">
            注册资料、测试结果、对话记录都在这儿。
          </p>
        </div>

        {/* 主操作：改资料 / 看对话记录 */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Link
            href="/dashboard/profile/edit"
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[.98]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            修改档案资料
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-rule bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-all hover:bg-sand-25 active:scale-[.98]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l4 2" />
            </svg>
            对话记录
          </Link>
        </div>

        {/* 注册档案聚合：账号 / 状态教育 / 方向地点 */}
        <ProfileSections profile={initialProfile} phone={phone} />

        {/* 职业兴趣测试结果 */}
        {assessment ? (
          <div className="card mb-4">
            <AssessmentSummary assessment={assessment} takenAtLabel={fmtTakenAt(assessment.takenAt)} />
            <Link href="/assessment" className="text-sm font-semibold text-sage-700 hover:underline">
              重新测一次（新结果会覆盖旧结果）→
            </Link>
          </div>
        ) : (
          <div className="card mb-4 flex flex-col items-start gap-2 border-dashed">
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
      </div>

      <HomeFooter lang="zh" />
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
        ['最近打算', optionLabel([...WORK_GOAL_WORKING, ...WORK_GOAL_JOBLESS], p?.workGoal)],
        ['入学年月', fmtMonthView(p?.enrollMonth)],
        ['学校', p?.school || '—'],
        ['专业分类', optionLabel(MAJOR_OPTIONS, p?.major)],
        ['毕业日期', fmtMonthView(p?.gradMonth)],
        ['全职经验', p?.fullTimeExp ? optionLabel(WORK_EXP_DURATION_OPTIONS, p.fullTimeExp) : '未填'],
        ['兼职经验', p?.partTimeExp ? optionLabel(WORK_EXP_DURATION_OPTIONS, p.partTimeExp) : '未填'],
      ];

  const careerNames = parseJsonArray(p?.careers)
    .map((v) => CAREER_OPTIONS.find((o) => o.value === v)?.label ?? v)
    .join('、');
  const locationRows: [string, string][] = [
    ['希望工作地点', p?.workProvince ? `${p.workProvince}${p.workCity ? ` · ${p.workCity}` : ''}` : '—'],
    ['目前所在地', p?.curProvince ? `${p.curProvince}${p.curCity ? ` · ${p.curCity}` : ''}` : '—'],
    ['感兴趣的职业方向', careerNames || '—'],
  ];

  return (
    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <InfoCard title="账号信息" rows={accountRows} />
      <InfoCard title={isStudent ? '在校信息' : p?.status === '待业' ? '待业信息' : '在职信息'} rows={schoolRows} />
      <InfoCard title="方向与地点" rows={locationRows} className="md:col-span-2" />
    </div>
  );
}

function InfoCard({ title, rows, className = '' }: { title: string; rows: [string, string][]; className?: string }) {
  return (
    <div className={`card ${className}`}>
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
