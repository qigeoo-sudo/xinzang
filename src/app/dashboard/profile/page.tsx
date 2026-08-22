'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';

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
  gradYears: '毕业年限',
  goals: '职业目标',
  interests: '兴趣方向',
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

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
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

  // 加载用户档案（无档案时使用空默认值）
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/user/profile')
      .then((res) => res.json())
      .then((data: { profile?: ProfileData }) => {
        if (data.profile) {
          applyProfile(data.profile);
          setConflicts(parseConflicts(data.profile.profileConflicts));
        }
      })
      .catch(() => {});
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

  // 状态切换 — 直接切换，无需弹窗
  // 切换后清空所有字段，仅当聊天记录里的状态与目标模板一致时才从聊天记录映射
  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === userStatus || !newStatus) return;

    // 1. 清除所有字段（含 nickname）
    setNickname('');
    setAge('');
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
    setConflicts([]);

    // 2. 切换状态，立即渲染新模板
    setUserStatus(newStatus);

    // 3. 调用 extract API（和聊天结束后自动提取是同一个流程）
    //    extract 会从聊天记录提取所有字段（包括 status）并写入数据库
    //    返回的 extractedStatus 是 LLM 从聊天记录提取出的原始 status
    let needPutStatus = true;
    try {
      const res = await fetch('/api/profile/extract', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          if (data.extractedStatus === newStatus) {
            // 聊天记录里的状态与目标模板一致，映射字段
            applyProfile(data.profile);
            setConflicts(parseConflicts(data.profile.profileConflicts));
            // extract 已经把正确的 status 写入数据库，不需要再 PUT
            needPutStatus = false;
          }
          // 否则不映射，表单保持空白
        }
      }
    } catch {
      // 提取失败不阻塞，用户可手动填写
    }

    // 4. 如果 extract 的 status 和目标不一致，需要手动 PUT 目标 status
    if (needPutStatus) {
      try {
        await fetch('/api/user/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch {
        // 保存失败不阻塞
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
          gradYears: gradYears ? parseInt(gradYears, 10) : undefined,
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

  if (status === 'loading') {
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
                    <select value={userStatus} onChange={(e) => handleStatusChange(e.target.value)} className="input-field">
                      <option value="">请选择</option>
                      <option value="在校">在校</option>
                      <option value="在职">在职</option>
                      <option value="待业">待业</option>
                    </select>
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
                      <input type="text" value={enrollmentYear} onChange={(e) => setEnrollmentYear(e.target.value)} placeholder="例如 2022" maxLength={50} className="input-field" />
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
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">学校</label>
                      <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={100} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">毕业年限</label>
                      <input type="number" value={gradYears} onChange={(e) => setGradYears(e.target.value)} min="0" max="60" placeholder="毕业几年" className="input-field" />
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
                      <label className="block text-sm font-medium text-ink mb-1.5">所在行业</label>
                      <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={50} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">工作内容</label>
                      <input type="text" value={jobContent} onChange={(e) => setJobContent(e.target.value)} maxLength={200} className="input-field" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">企业类型</label>
                      <select value={companyType} onChange={(e) => setCompanyType(e.target.value)} className="input-field">
                        <option value="">请选择</option>
                        <option value="国企">国企</option>
                        <option value="民企">民企</option>
                        <option value="外企">外企</option>
                        <option value="创业公司">创业公司</option>
                        <option value="互联网">互联网</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">工作满意度</label>
                      <select value={jobSatisfaction} onChange={(e) => setJobSatisfaction(e.target.value)} className="input-field">
                        <option value="">请选择</option>
                        <option value="5">5分 非常满意</option>
                        <option value="4">4分 比较满意</option>
                        <option value="3">3分 一般</option>
                        <option value="2">2分 不太满意</option>
                        <option value="1">1分 非常不满意</option>
                      </select>
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
                {/* 在校专属：兴趣方向 + 职业目标 */}
                {isStudent && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">兴趣方向</label>
                      <input type="text" value={interests} onChange={(e) => setInterests(e.target.value)} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">职业目标</label>
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
              onClick={() => setClearStep('options')}
              className="btn-secondary flex-1 text-sm text-danger border-danger"
            >
              清空
            </button>
            <button type="button" onClick={() => router.push('/dashboard')} className="btn-secondary">
              返回
            </button>
          </div>
        </form>

        {/* 清空选项弹窗 */}
        {clearStep === 'options' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl">
              <h3 className="text-base font-semibold text-ink mb-2">清空</h3>
              <p className="text-sm text-muted mb-4">请选择清空范围：</p>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleClearFields}
                  className="w-full py-2.5 rounded-lg text-sm border border-slate-200 text-ink hover:bg-slate-50"
                >
                  仅清空档案字段（保留聊天记录）
                </button>
                <button
                  type="button"
                  onClick={() => setClearStep('b1')}
                  className="w-full py-2.5 rounded-lg text-sm bg-danger text-white hover:bg-red-600"
                >
                  清空全部数据（含聊天记录）
                </button>
              </div>
              <div className="mt-4 text-center">
                <button type="button" onClick={() => setClearStep('none')} className="text-sm text-muted hover:text-ink">
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

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
