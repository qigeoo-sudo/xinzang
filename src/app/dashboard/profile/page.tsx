'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { CustomSelect } from '@/components/custom-select';

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

// 档案数据类型
interface ProfileData {
  nickname?: string | null;
  age?: number | null;
  status?: string | null;
  city?: string | null;
  school?: string | null;
  major?: string | null;
  enrollmentYear?: string | null;
  industry?: string | null;
  jobContent?: string | null;
  companyType?: string | null;
  jobSatisfaction?: number | null;
  gradYears?: number | null;
  interests?: string | null;
  goals?: string | null;
  infoChannels?: string | null;
  careerSpending?: string | null;
  careerAnxiety?: string | null;
  jobChangeStatus?: string | null;
  helpPriority?: string | null;
  mentorPreference?: string | null;
  mentorHelpAreas?: string | null;
  productInterest?: string | null;
  productTrigger?: string | null;
  productConcern?: string | null;
  willingToPay?: string | null;
  recommendedMentors?: string | null;
  inferredProfile?: string | null;
  profileConflicts?: string | null;
}

// 档案冲突类型
interface ProfileConflict {
  field: string;
  confirmedValue: string;
  inferredValue: unknown;
  status: string;
}

const CONFLICT_FIELD_LABELS: Record<string, string> = {
  status: '当前状态',
  city: '所在城市',
  school: '学校',
  major: '专业',
  enrollmentYear: '入学年份',
  industry: '行业',
  jobContent: '工作内容',
  companyType: '公司类型',
  gradYears: '毕业年份',
  goals: '更多看法',
  interests: '爱好倾向',
  careerAnxiety: '职业焦虑',
  jobChangeStatus: '求职/换工作状态',
};

function parseConflicts(str?: string | null): ProfileConflict[] {
  if (!str) return [];
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? arr.filter((c) => c.status === 'pending') : [];
  } catch {
    return [];
  }
}

// 模板底色 — 页面背景用 25 色阶（更淡），卡片用 50 色阶
function getTemplateBg(status: string): string {
  if (status === '在职') return 'bg-sage-25';
  if (status === '待业') return 'bg-brand-25';
  return 'bg-sand-25';
}

// 卡片底色 — 比 50 更淡，和页面背景区分
function getCardBg(status: string): string {
  if (status === '在职') return 'bg-sage-50';
  if (status === '待业') return 'bg-brand-50';
  return 'bg-sand-50';
}

const STATUS_LABELS: Record<string, string> = {
  '在校': '在校',
  '在职': '在职',
  '待业': '待业',
};

const ENROLLMENT_YEAR_OPTIONS = [
  { value: '<2006', label: '2006年以前' },
  ...Array.from({ length: 21 }, (_, i) => {
    const y = 2006 + i;
    return { value: String(y), label: `${y}年` };
  }),
];

const GRADUATION_YEAR_OPTIONS = [
  { value: '<1986', label: '1986年以前' },
  ...Array.from({ length: 41 }, (_, i) => {
    const y = 1986 + i;
    return { value: String(y), label: `${y}年` };
  }),
];

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [clearStep, setClearStep] = useState<'none' | 'options' | 'b1' | 'b2'>('none');

  // 折叠状态 — 默认全部展开
  const [basicOpen, setBasicOpen] = useState(true);
  const [educationOpen, setEducationOpen] = useState(true);
  const [careerInfoOpen, setCareerInfoOpen] = useState(true);
  const [developmentOpen, setDevelopmentOpen] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(true);

  // 基本信息
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState('');
  const [userStatus, setUserStatus] = useState('');
  const [city, setCity] = useState('');

  // 教育背景
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [enrollmentYear, setEnrollmentYear] = useState('');

  // 职业信息
  const [industry, setIndustry] = useState('');
  const [jobContent, setJobContent] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [jobSatisfaction, setJobSatisfaction] = useState('');
  const [gradYears, setGradYears] = useState('');

  // 职业发展
  const [interests, setInterests] = useState('');
  const [goals, setGoals] = useState('');
  const [infoChannels, setInfoChannels] = useState('');
  const [careerSpending, setCareerSpending] = useState('');
  const [careerAnxiety, setCareerAnxiety] = useState('');
  const [jobChangeStatus, setJobChangeStatus] = useState('');

  // 问卷结果
  const [helpPriority, setHelpPriority] = useState('');
  const [mentorPreference, setMentorPreference] = useState('');
  const [mentorHelpAreas, setMentorHelpAreas] = useState('');
  const [productInterest, setProductInterest] = useState('');
  const [productTrigger, setProductTrigger] = useState('');
  const [productConcern, setProductConcern] = useState('');
  const [willingToPay, setWillingToPay] = useState('');

  // 推荐导师
  const [recommendedMentors, setRecommendedMentors] = useState('');

  // 待处理冲突
  const [conflicts, setConflicts] = useState<ProfileConflict[]>([]);

  // 内存快照 — 页面首次加载的原始档案数据，切换模板时用于还原
  const [initialProfile, setInitialProfile] = useState<ProfileData | null>(null);

  // 将档案数据加载到表单状态
  const applyProfile = (p: ProfileData) => {
    setNickname(p.nickname || '');
    setAge(p.age ? String(p.age) : '');
    setUserStatus(p.status || '');
    setCity(p.city || '');
    setSchool(p.school || '');
    setMajor(p.major || '');
    setEnrollmentYear(p.enrollmentYear || '');
    setIndustry(p.industry || '');
    setJobContent(p.jobContent || '');
    setCompanyType(p.companyType || '');
    setJobSatisfaction(p.jobSatisfaction ? String(p.jobSatisfaction) : '');
    setGradYears(p.gradYears ? String(p.gradYears) : '');
    setInterests(parseJsonArray(p.interests).join('、'));
    setGoals(p.goals || '');
    setInfoChannels(parseJsonArray(p.infoChannels).join('、'));
    setCareerSpending(p.careerSpending || '');
    setCareerAnxiety(p.careerAnxiety || '');
    setJobChangeStatus(p.jobChangeStatus || '');
    setHelpPriority(parseJsonArray(p.helpPriority).join('\n'));
    setMentorPreference(parseJsonArray(p.mentorPreference).join('\n'));
    setMentorHelpAreas(parseJsonArray(p.mentorHelpAreas).join('、'));
    setProductInterest(p.productInterest || '');
    setProductTrigger(parseJsonArray(p.productTrigger).join('、'));
    setProductConcern(parseJsonArray(p.productConcern).join('、'));
    setWillingToPay(p.willingToPay || '');
    setRecommendedMentors(parseJsonArray(p.recommendedMentors).join('、'));
  };

  // 加载用户档案
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    const loadProfile = () => {
      fetch('/api/user/profile', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data: { profile?: ProfileData }) => {
          if (cancelled) return;
          if (data.profile) {
            applyProfile(data.profile);
            setInitialProfile(data.profile);  // 内存备份
            setConflicts(parseConflicts(data.profile.profileConflicts));
          }
          setProfileLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setProfileLoaded(true);
        });
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [status, router]);

  // 未登录重定向
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/dashboard/profile');
    }
  }, [status, router]);

  const resetFormState = () => {
    setError('');
    setNickname('');
    setAge('');
    setUserStatus('');
    setCity('');
    setSchool('');
    setMajor('');
    setEnrollmentYear('');
    setIndustry('');
    setJobContent('');
    setCompanyType('');
    setJobSatisfaction('');
    setGradYears('');
    setInterests('');
    setGoals('');
    setInfoChannels('');
    setCareerSpending('');
    setCareerAnxiety('');
    setJobChangeStatus('');
    setHelpPriority('');
    setMentorPreference('');
    setMentorHelpAreas('');
    setProductInterest('');
    setProductTrigger('');
    setProductConcern('');
    setWillingToPay('');
    setRecommendedMentors('');
  };

  // 仅清空档案字段（保留聊天记录）
  const handleClearFields = async () => {
    try {
      const res = await fetch('/api/profile/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'fields' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '清空失败');
        setClearStep('none');
        return;
      }
      resetFormState();
      setConflicts([]);
      setClearStep('none');
    } catch {
      setError('网络错误，请稍后再试');
      setClearStep('none');
    }
  };

  // 清空全部数据（聊天记录 + 档案 + 历史 + 本地缓存），成功后返回首页
  const handleClearAll = async () => {
    try {
      const res = await fetch('/api/profile/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '清空失败');
        setClearStep('none');
        return;
      }
      // 清除聊天相关 localStorage，避免旧对话被前端恢复
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('chat-') || key.startsWith('ai-guide-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      router.push('/');
      router.refresh();
    } catch {
      setError('网络错误，请稍后再试');
      setClearStep('none');
    }
  };

  const handleResolveConflict = async (field: string, choice: 'confirmed' | 'inferred') => {
    setError('');
    try {
      const res = await fetch('/api/user/profile/resolve-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, choice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '解决失败');
        return;
      }
      setConflicts((prev) => prev.filter((c) => c.field !== field));
    } catch {
      setError('网络错误，请稍后再试');
    }
  };

  // 状态切换 — 从内存快照还原表单，再覆写新状态
  const handleStatusChange = (newStatus: string) => {
    if (newStatus === userStatus || !newStatus) return;
    if (initialProfile) {
      applyProfile(initialProfile);
    } else {
      resetFormState();
    }
    setUserStatus(newStatus);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 必须选择状态才能保存
    if (!userStatus) {
      setError('请先选择当前状态');
      return;
    }

    // 全部字段为空则不保存
    if (
      !nickname &&
      !age &&
      !userStatus &&
      !city &&
      !school &&
      !major &&
      !enrollmentYear &&
      !industry &&
      !jobContent &&
      !companyType &&
      !jobSatisfaction &&
      !gradYears &&
      !interests &&
      !goals &&
      !infoChannels &&
      !careerSpending &&
      !careerAnxiety &&
      !jobChangeStatus &&
      !helpPriority &&
      !mentorPreference &&
      !mentorHelpAreas &&
      !productInterest &&
      !productTrigger &&
      !productConcern &&
      !willingToPay &&
      !recommendedMentors
    ) {
      return;
    }

    setLoading(true);
    setError('');
    setSaved(false);

    const parseStringArray = (s: string) =>
      s.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname || undefined,
          age: age ? parseInt(age, 10) : undefined,
          status: userStatus || undefined,
          city: city || undefined,
          school: school || undefined,
          major: major || undefined,
          enrollmentYear: enrollmentYear || undefined,
          industry: industry || undefined,
          jobContent: jobContent || undefined,
          companyType: companyType || undefined,
          jobSatisfaction: jobSatisfaction ? parseInt(jobSatisfaction, 10) : undefined,
          gradYears: gradYears || undefined,
          interests: interests ? parseStringArray(interests) : undefined,
          goals: goals || undefined,
          infoChannels: infoChannels ? parseStringArray(infoChannels) : undefined,
          careerSpending: careerSpending || undefined,
          careerAnxiety: careerAnxiety || undefined,
          jobChangeStatus: jobChangeStatus || undefined,
          helpPriority: helpPriority ? parseStringArray(helpPriority) : undefined,
          mentorPreference: mentorPreference ? parseStringArray(mentorPreference) : undefined,
          mentorHelpAreas: mentorHelpAreas ? parseStringArray(mentorHelpAreas) : undefined,
          productInterest: productInterest || undefined,
          productTrigger: productTrigger ? parseStringArray(productTrigger) : undefined,
          productConcern: productConcern ? parseStringArray(productConcern) : undefined,
          willingToPay: willingToPay || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
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

  const isEmployed = userStatus === '在职';
  const isUnemployed = userStatus === '待业';
  const isStudent = userStatus === '在校';
  const showCareerInfo = isEmployed || isUnemployed; // 在职/待业都显示职业信息
  const templateBg = getTemplateBg(userStatus);
  const cardBg = getCardBg(userStatus);

  return (
    <div className={`min-h-screen flex flex-col ${templateBg}`}>
      <Header />

      <div className="page-container">
        {/* 标题 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">我的档案</h1>
          <p className="text-sm text-muted mt-1">
            AI职导访谈后自动生成，可随时修改
          </p>
        </div>

        {/* 待确认冲突 */}
        {conflicts.length > 0 && (
          <div className="card space-y-3 mb-6 border-warn/40">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A574" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
              <h2 className="text-sm font-semibold text-ink">资料存在待确认冲突</h2>
            </div>
            {conflicts.map((c) => (
              <div key={c.field} className="bg-warn/5 rounded-lg p-3 space-y-2">
                <p className="text-sm text-ink">
                  <span className="font-medium">{CONFLICT_FIELD_LABELS[c.field] || c.field}</span>
                  ：已确认「
                  <span className="font-medium">{c.confirmedValue}</span>」vs 推断「
                  <span className="text-accent font-medium">
                    {typeof c.inferredValue === 'object' && c.inferredValue
                      ? JSON.stringify(c.inferredValue)
                      : String(c.inferredValue)}
                  </span>」
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(c.field, 'confirmed')}
                    className="btn-secondary !py-1.5 !px-3 text-xs"
                  >
                    保留已确认
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(c.field, 'inferred')}
                    className="btn-primary !py-1.5 !px-3 text-xs"
                  >
                    采用推断
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 profile-form">
          {/* 仅个人档案页面：输入框字体与标签一致(14px)，不加粗 */}
          <style>{`
            .profile-form input, .profile-form textarea, .profile-form select {
              font-size: 14px;
              font-weight: 400;
            }
          `}</style>

          {/* 基本信息 — 所有模板共用 */}
          <div className={`card space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">基本信息</h2>
              <button type="button" onClick={() => setBasicOpen(!basicOpen)} className="text-muted hover:text-ink text-sm">
                {basicOpen ? '收起' : '展开'}
              </button>
            </div>
            {basicOpen && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">称呼</label>
                    <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">年龄</label>
                    <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min="0" max="150" className="input-field" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">当前状态</label>
                    <CustomSelect
                      value={userStatus}
                      onChange={handleStatusChange}
                      options={[
                        { value: '在校', label: '在校' },
                        { value: '在职', label: '在职' },
                        { value: '待业', label: '待业' },
                      ]}
                      placeholder="请选择"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">所在城市</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} className="input-field" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 教育背景 — 在校显示入学年份+学校+专业，在职显示学校+毕业年限 */}
          <div className={`card space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">教育背景</h2>
              <button type="button" onClick={() => setEducationOpen(!educationOpen)} className="text-muted hover:text-ink text-sm">
                {educationOpen ? '收起' : '展开'}
              </button>
            </div>
            {educationOpen && (
              <div className="space-y-4">
                {isStudent ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">入学年份</label>
                      <CustomSelect
                        value={enrollmentYear}
                        onChange={setEnrollmentYear}
                        options={ENROLLMENT_YEAR_OPTIONS}
                        placeholder="请选择入学年份"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">学校</label>
                      <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={100} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">专业</label>
                      <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} maxLength={100} className="input-field" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">毕业学校</label>
                        <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={100} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">所学专业</label>
                        <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} maxLength={100} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">毕业年份</label>
                        <CustomSelect
                          value={gradYears}
                          onChange={setGradYears}
                          options={GRADUATION_YEAR_OPTIONS}
                          placeholder="请选择毕业年份"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 职业信息 — 在职/待业显示 */}
          {showCareerInfo && (
            <div className={`card space-y-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">职业信息</h2>
                <button type="button" onClick={() => setCareerInfoOpen(!careerInfoOpen)} className="text-muted hover:text-ink text-sm">
                  {careerInfoOpen ? '收起' : '展开'}
                </button>
              </div>
              {careerInfoOpen && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{isUnemployed ? '曾在行业' : '所在行业'}</label>
                      <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={50} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{isUnemployed ? '曾工作过' : '工作内容'}</label>
                      <input type="text" value={jobContent} onChange={(e) => setJobContent(e.target.value)} maxLength={200} className="input-field" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">企业类型</label>
                      <CustomSelect
                        value={companyType}
                        onChange={setCompanyType}
                        options={[
                          { value: '国企', label: '国企' },
                          { value: '民企', label: '民企' },
                          { value: '外企', label: '外企' },
                          { value: '创业公司', label: '创业公司' },
                          { value: '互联网', label: '互联网' },
                          { value: '其他', label: '其他' },
                        ]}
                        placeholder="请选择"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">工作满意度</label>
                      <CustomSelect
                        value={jobSatisfaction}
                        onChange={setJobSatisfaction}
                        options={[
                          { value: '5', label: '5分 非常满意' },
                          { value: '4', label: '4分 比较满意' },
                          { value: '3', label: '3分 一般' },
                          { value: '2', label: '2分 不太满意' },
                          { value: '1', label: '1分 非常不满意' },
                        ]}
                        placeholder="请选择"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 职业发展 — 在校和在职显示不同字段 */}
          <div className={`card space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">职业发展</h2>
              <button type="button" onClick={() => setDevelopmentOpen(!developmentOpen)} className="text-muted hover:text-ink text-sm">
                {developmentOpen ? '收起' : '展开'}
              </button>
            </div>
            {developmentOpen && (
              <div className="space-y-4">
                {/* 在校专属：爱好倾向 + 职业目标 */}
                {isStudent && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">爱好倾向</label>
                      <input type="text" value={interests} onChange={(e) => setInterests(e.target.value)} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">更多看法</label>
                      <textarea value={goals} onChange={(e) => setGoals(e.target.value)} maxLength={500} rows={2} className="input-field resize-none" />
                    </div>
                  </>
                )}

                {/* 共通：信息渠道 + 职业投资 */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">信息渠道</label>
                  <input type="text" value={infoChannels} onChange={(e) => setInfoChannels(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">职业投资</label>
                  <input type="text" value={careerSpending} onChange={(e) => setCareerSpending(e.target.value)} className="input-field" />
                </div>

                {/* 在校：找工作困扰；在职/待业：职业焦虑 */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">
                    {isStudent ? '找工作困扰' : '职业焦虑'}
                  </label>
                  <textarea value={careerAnxiety} onChange={(e) => setCareerAnxiety(e.target.value)} maxLength={1000} rows={3} className="input-field resize-none" />
                </div>

                {/* 在职专属：换工作情况 */}
                {isEmployed && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">换工作情况</label>
                    <textarea value={jobChangeStatus} onChange={(e) => setJobChangeStatus(e.target.value)} maxLength={500} rows={2} className="input-field resize-none" />
                  </div>
                )}

                {/* 待业专属：求职情况 */}
                {isUnemployed && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">求职情况</label>
                    <textarea value={jobChangeStatus} onChange={(e) => setJobChangeStatus(e.target.value)} maxLength={500} rows={2} className="input-field resize-none" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 访谈结果 */}
          {(helpPriority || mentorPreference || mentorHelpAreas || productInterest || recommendedMentors) && (
            <div className={`card space-y-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">访谈结果</h2>
                <button type="button" onClick={() => setResultsOpen(!resultsOpen)} className="text-muted hover:text-ink text-sm">
                  {resultsOpen ? '收起' : '展开'}
                </button>
              </div>
              {resultsOpen && (
                <div className="space-y-4">
                  {recommendedMentors && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">AI职导推荐导师</label>
                      <p className="text-sm text-brand-600">{recommendedMentors}</p>
                    </div>
                  )}

                  {helpPriority && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">最需要帮助的（排序）</label>
                      <pre className="text-sm text-muted whitespace-pre-wrap font-sans">{helpPriority}</pre>
                    </div>
                  )}

                  {mentorPreference && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">最想深聊的人群（排序）</label>
                      <pre className="text-sm text-muted whitespace-pre-wrap font-sans">{mentorPreference}</pre>
                    </div>
                  )}

                  {mentorHelpAreas && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">希望导师帮助的方面</label>
                      <p className="text-sm text-muted">{mentorHelpAreas}</p>
                    </div>
                  )}

                  {productInterest && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">对产品的第一反应</label>
                      <p className="text-sm text-muted">{productInterest}</p>
                    </div>
                  )}

                  {productTrigger && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">什么情况下打开产品</label>
                      <p className="text-sm text-muted">{productTrigger}</p>
                    </div>
                  )}

                  {productConcern && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">最担心什么</label>
                      <p className="text-sm text-muted">{productConcern}</p>
                    </div>
                  )}

                  {willingToPay && (
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">愿意每月付多少</label>
                      <p className="text-sm text-muted">{willingToPay}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 消息提示 */}
          {error && (
            <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
              {error}
            </div>
          )}
          {saved && (
            <div className="bg-success/10 text-success text-sm px-4 py-3 rounded-lg animate-fade-in">
              档案已保存
            </div>
          )}

          {/* 提交按钮 */}
          <div className="flex gap-3 items-center">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => setClearStep('b1')}
              className="btn-secondary flex-1 text-sm text-danger border-danger"
            >
              清空
            </button>
            <button type="button" onClick={() => router.push('/dashboard')} className="btn-secondary">
              返回
            </button>
          </div>
        </form>

        {/* 清空全部 — 第一次确认 */}
        {clearStep === 'b1' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl">
              <h3 className="text-base font-semibold text-ink mb-2">确认清空</h3>
              <p className="text-sm text-muted mb-4">
                确定要清空吗？此操作不可撤销，它会清空所有聊天记录，所有数据库里你的信息，导师分身将不再记得你。
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setClearStep('none')} className="btn-secondary flex-1 text-sm">取消</button>
                <button type="button" onClick={() => setClearStep('b2')} className="btn-primary flex-1 text-sm bg-danger hover:bg-red-600">确认清空</button>
              </div>
            </div>
          </div>
        )}

        {/* 清空全部 — 再次确认 */}
        {clearStep === 'b2' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl bg-brand-900">
              <h3 className="text-base font-semibold text-white mb-2">再次确认</h3>
              <p className="text-sm text-brand-100 mb-4">慎重起见，请再次确认。清空后不可恢复。</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setClearStep('none')} className="flex-1 text-sm py-2.5 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors">取消</button>
                <button type="button" onClick={handleClearAll} className="flex-1 text-sm py-2.5 rounded-lg bg-danger text-white font-medium hover:opacity-90 transition-opacity">确认清空</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
