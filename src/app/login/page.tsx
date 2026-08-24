'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';

type LoginMethod = 'phone' | 'email';

function LoginForm() {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get('callbackUrl') || '/';
  const callbackUrl = rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/';

  const [method, setMethod] = useState<LoginMethod>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email: identifier,
        password,
        redirect: false,
      });

      if (result?.error) {
        try {
          const statusRes = await fetch(`/api/auth/login-status?identifier=${encodeURIComponent(identifier)}`);
          const statusData = await statusRes.json();
          setError(statusData.message || '手机号/邮箱或密码不正确');
        } catch {
          setError('手机号/邮箱或密码不正确');
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
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* 标题 */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-ink mb-2">欢迎回来</h1>
            <p className="text-sm text-muted">登录继续你的职业探索之旅</p>
          </div>

          {/* 表单卡片 */}
          <form onSubmit={handleSubmit} className="card space-y-4">
            {/* 错误提示 */}
            {error && (
              <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
                {error}
              </div>
            )}

            {/* 登录方式切换 */}
            <div className="flex gap-2 p-1 bg-beige rounded-lg">
              <button
                type="button"
                onClick={() => { setMethod('phone'); setError(''); }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  method === 'phone'
                    ? 'bg-white text-accent shadow-sm'
                    : 'text-muted'
                }`}
              >
                手机登录
              </button>
              <button
                type="button"
                onClick={() => { setMethod('email'); setError(''); }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  method === 'email'
                    ? 'bg-white text-accent shadow-sm'
                    : 'text-muted'
                }`}
              >
                邮箱登录
              </button>
            </div>

            {/* 手机/邮箱输入 */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {method === 'phone' ? '手机号' : '邮箱'}
              </label>
              <input
                type={method === 'phone' ? 'tel' : 'email'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete={method === 'phone' ? 'tel' : 'email'}
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
                href={`/forgot-password${identifier ? `?method=${method}&target=${encodeURIComponent(identifier)}` : ''}`}
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
              href={callbackUrl && callbackUrl !== '/' ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/register'}
              className="text-accent font-medium hover:underline"
            >
              免费注册
            </Link>
          </p>
        </div>
      </div>
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
