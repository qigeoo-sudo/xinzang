'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // 表单状态
  const [name, setName] = useState('');
  const [education, setEducation] = useState('');
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [grade, setGrade] = useState('');
  const [interests, setInterests] = useState('');
  const [goals, setGoals] = useState('');

  // 从 session 初始化昵称
  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session]);

  // 加载已有档案数据
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/user/profile')
        .then((res) => res.json())
        .then((data) => {
          if (data.profile) {
            setEducation(data.profile.education || '');
            setSchool(data.profile.school || '');
            setMajor(data.profile.major || '');
            setGrade(data.profile.grade || '');
            setInterests(
              data.profile.interests
                ? JSON.parse(data.profile.interests).join('、')
                : ''
            );
            setGoals(data.profile.goals || '');
          }
        })
        .catch(() => {});
    }
  }, [status]);

  // 未登录重定向
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/dashboard/profile');
    }
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSaved(false);

    try {
      // 更新昵称 (通过 Auth.js session update)
      if (name !== session?.user?.name) {
        await update({ name });
      }

      // 更新档案
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          education: education || undefined,
          school: school || undefined,
          major: major || undefined,
          grade: grade || undefined,
          interests: interests
            ? interests.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
            : undefined,
          goals: goals || undefined,
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
            完善档案信息，帮助 AI 导师更好地理解你的需求
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 基本信息 */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-ink">基本信息</h2>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                昵称
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                教育背景
              </label>
              <select
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                className="input-field"
              >
                <option value="">请选择</option>
                <option value="高中">高中</option>
                <option value="本科">本科</option>
                <option value="硕士">硕士</option>
                <option value="博士">博士</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                学校
              </label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="如：海南大学"
                maxLength={100}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                专业
              </label>
              <input
                type="text"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                placeholder="如：计算机科学"
                maxLength={100}
                className="input-field"
              />
            </div>
          </div>

          {/* 职业信息 */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-ink">职业信息</h2>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                兴趣方向
              </label>
              <input
                type="text"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="如：互联网、AI、创业（用顿号分隔）"
                className="input-field"
              />
              <p className="text-xs text-muted mt-1">
                用顿号分隔多个兴趣，最多 10 个
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                职业目标
              </label>
              <textarea
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="如：找到适合的职业方向、进入互联网行业..."
                maxLength={500}
                rows={3}
                className="input-field resize-none"
              />
              <p className="text-xs text-muted mt-1">
                {goals.length} / 500 字
              </p>
            </div>
          </div>

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
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? '保存中...' : '保存档案'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="btn-secondary"
            >
              返回
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
