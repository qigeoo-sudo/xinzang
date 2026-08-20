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
  education?: string | null;
  school?: string | null;
  major?: string | null;
  grade?: string | null;
  industry?: string | null;
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
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 折叠状态 — 默认全部展开
  const [basicOpen, setBasicOpen] = useState(true);
  const [educationOpen, setEducationOpen] = useState(true);
  const [developmentOpen, setDevelopmentOpen] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(true);

  // 基本信息
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState('');
  const [userStatus, setUserStatus] = useState('');
  const [city, setCity] = useState('');

  // 教育背景
  const [education, setEducation] = useState('');
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [grade, setGrade] = useState('');

  // 职业信息
  const [industry, setIndustry] = useState('');
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

  // 将档案数据加载到表单状态
  const applyProfile = (p: ProfileData) => {
    setNickname(p.nickname || '');
    setAge(p.age ? String(p.age) : '');
    setUserStatus(p.status || '');
    setCity(p.city || '');
    setEducation(p.education || '');
    setSchool(p.school || '');
    setMajor(p.major || '');
    setGrade(p.grade || '');
    setIndustry(p.industry || '');
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

  const handleClear = () => {
    setShowClearConfirm(false);
    setError('');
    setNickname('');
    setAge('');
    setUserStatus('');
    setCity('');
    setEducation('');
    setSchool('');
    setMajor('');
    setGrade('');
    setIndustry('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 全部字段为空则不保存
    if (
      !nickname &&
      !age &&
      !userStatus &&
      !city &&
      !education &&
      !school &&
      !major &&
      !grade &&
      !industry &&
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
          education: education || undefined,
          school: school || undefined,
          major: major || undefined,
          grade: grade || undefined,
          industry: industry || undefined,
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="page-container">
        {/* 标题 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">我的档案</h1>
          <p className="text-sm text-muted mt-1">
            AI职导访谈后自动生成，可随时修改
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 profile-form">
          {/* 仅个人档案页面：输入框字体与标签一致(14px)，不加粗 */}
          <style>{`
            .profile-form input, .profile-form textarea, .profile-form select {
              font-size: 14px;
              font-weight: 400;
            }
          `}</style>
          {/* 基本信息 */}
          <div className="card space-y-4">
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
                    <select value={userStatus} onChange={(e) => setUserStatus(e.target.value)} className="input-field">
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

          {/* 教育背景 */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">教育背景</h2>
              <button type="button" onClick={() => setEducationOpen(!educationOpen)} className="text-muted hover:text-ink text-sm">
                {educationOpen ? '收起' : '展开'}
              </button>
            </div>
            {educationOpen && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">学历</label>
                    <select value={education} onChange={(e) => setEducation(e.target.value)} className="input-field">
                      <option value="">请选择</option>
                      <option value="高中">高中</option>
                      <option value="本科">本科</option>
                      <option value="硕士">硕士</option>
                      <option value="博士">博士</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">年级</label>
                    <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">学校</label>
                  <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={100} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">专业</label>
                  <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} maxLength={100} className="input-field" />
                </div>
              </div>
            )}
          </div>

          {/* 职业发展 */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">职业发展</h2>
              <button type="button" onClick={() => setDevelopmentOpen(!developmentOpen)} className="text-muted hover:text-ink text-sm">
                {developmentOpen ? '收起' : '展开'}
              </button>
            </div>
            {developmentOpen && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">兴趣方向</label>
                  <input type="text" value={interests} onChange={(e) => setInterests(e.target.value)} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">职业目标</label>
                  <textarea value={goals} onChange={(e) => setGoals(e.target.value)} maxLength={500} rows={2} className="input-field resize-none" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">信息渠道</label>
                  <input type="text" value={infoChannels} onChange={(e) => setInfoChannels(e.target.value)} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">职业投资</label>
                  <input type="text" value={careerSpending} onChange={(e) => setCareerSpending(e.target.value)} className="input-field" />
                </div>
              </div>
            )}
          </div>

          {/* 访谈结果 */}
          {(helpPriority || mentorPreference || mentorHelpAreas || productInterest || recommendedMentors) && (
            <div className="card space-y-4">
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
              onClick={() => setShowClearConfirm(true)}
              className="btn-secondary flex-1 text-sm text-danger border-danger"
            >
              清空
            </button>
            <button type="button" onClick={() => router.push('/dashboard')} className="btn-secondary">
              返回
            </button>
          </div>
        </form>

        {/* 清空确认弹窗 */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl">
              <h3 className="text-base font-semibold text-ink mb-2">确认清空档案</h3>
              <p className="text-sm text-muted mb-4">
                确定要清空所有档案内容吗？此操作不可撤销，但变更历史会被保留。
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="btn-secondary flex-1 text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="btn-primary flex-1 text-sm bg-danger hover:bg-red-600"
                >
                  确认清空
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
