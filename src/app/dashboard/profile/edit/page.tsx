'use client';

/**
 * 档案分步编辑页 — 复用 RegisterWizard（mode="edit"）
 * 路由：/dashboard/profile/edit
 *
 * 进页面先拉现有档案，映射成向导回填值；未登录跳登录页。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { RegisterWizard, type WizardInitialValues } from '@/components/register-wizard';

// UserProfile.status 中文值 → 向导身份值
const STATUS_IDENTITY_MAP: Record<string, WizardInitialValues['identity']> = {
  在校: 'student',
  在职: 'working',
  待业: 'jobless',
};

interface RawProfile {
  nickname?: string | null;
  birthMonth?: string | null;
  status?: string | null;
  enrollMonth?: string | null;
  school?: string | null;
  major?: string | null;
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

const MONTH_RE = /^\d{4}-\d{2}$/;
const monthOrEmpty = (v?: string | null) => (v && MONTH_RE.test(v) ? v : '');

function parseCareers(v?: string | null): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function ProfileEditPage() {
  const { status } = useSession();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<WizardInitialValues | undefined>();
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/user/profile', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/login?callbackUrl=/dashboard/profile/edit');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const p: RawProfile = data.profile ?? {};
        const identity = (p.status && STATUS_IDENTITY_MAP[p.status]) || '';
        setInitial({
          nickname: p.nickname ?? '',
          birthMonth: monthOrEmpty(p.birthMonth),
          identity,
          enrollMonth: monthOrEmpty(p.enrollMonth),
          school: p.school ?? '',
          major: p.major ?? '',
          // 跨身份的毕业日期不回填：旧分支的残留值保存时显式清成 null
          expectedGrad: identity === 'student' ? monthOrEmpty(p.expectedGrad) : '',
          gradMonth:
            identity === 'working' || identity === 'jobless'
              ? monthOrEmpty(p.gradMonth)
              : '',
          workGoal: p.workGoal ?? '',
          fullTimeExp: p.fullTimeExp ?? '',
          partTimeExp: p.partTimeExp ?? '',
          workProvince: p.workProvince ?? '',
          // 落库存的是中文文案，下拉需要哨兵值
          workCity: p.workCity === '均可考虑' ? '__any__' : p.workCity ?? '',
          curProvince: p.curProvince ?? '',
          curCity: p.curCity === '其他' ? '__other__' : p.curCity ?? '',
          careers: parseCareers(p.careers),
        });
        setPhone(data.phone ?? '');
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status, router]);

  // 未登录等中间件/会话处理；数据未就绪前不渲染向导，保证初始值生效
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F2E6D8' }}>
        <p className="text-sm" style={{ color: '#5A6B7E' }}>加载中…</p>
      </div>
    );
  }

  return <RegisterWizard mode="edit" initial={initial} phone={phone} />;
}
