'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';
import { PageHero, GoldFlakes, PaperCredits } from '@/components/page-shell';

function LoginForm() {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get('callbackUrl') || '/';
  const callbackUrl = rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/';

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        phone,
        password,
        redirect: false,
      });

      if (result?.error) {
        try {
          const statusRes = await fetch(`/api/auth/login-status?identifier=${encodeURIComponent(phone)}`);
          const statusData = await statusRes.json();
          setError(statusData.message || '手机号或密码不正确');
        } catch {
          setError('手机号或密码不正确');
        }
      } else if (result?.ok) {
        // 使用完整页面跳转确保 session cookie 生效后再渲染受保护页面
        window.location.href = callbackUrl;
      }
    } catch {
      setError('登录失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-bg cream-foil overflow-hidden">
      <Header />
      <GoldFlakes />

      <PageHero
        eyebrow="Welcome Back"
        title="欢迎回来"
        subtitle="登录继续你的职业探索之旅。"
        watermark="登"
      />

      <main className="relative z-10 flex flex-1 justify-center px-4 py-10 md:py-14">
        <div className="w-full max-w-sm">
          {/* 表单卡片：暖白信纸落在奶油底上 */}
          <form onSubmit={handleSubmit} className="letter-paper space-y-4 rounded-[20px] p-6">
            {/* 错误提示 */}
            {error && (
              <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
                {error}
              </div>
            )}

            {/* 手机号输入 */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                手机号
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                className="input-field"
              />
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={64}
                autoComplete="current-password"
                className="input-field"
              />
            </div>

            {/* 忘记密码 */}
            <div className="text-right">
              <Link
                href={`/forgot-password${phone ? `?target=${encodeURIComponent(phone)}` : ''}`}
                className="text-xs text-accent hover:underline"
              >
                忘记密码？
              </Link>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          {/* 注册引导 */}
          <p className="text-center text-sm text-muted mt-6">
            还没有账号？{' '}
            <Link
              href={callbackUrl && callbackUrl !== '/' ? `/register-v2?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/register-v2'}
              className="text-accent font-medium hover:underline"
            >
              免费注册
            </Link>
          </p>
        </div>
      </main>

      <PaperCredits lang="zh" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted">加载中...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
