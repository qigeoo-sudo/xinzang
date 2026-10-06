'use client';

/**
 * 龙虾工作台登录 gate：未登录访问 /content-ops（或 content.aihr.top 根）时显示。
 * 不跳转到网站 /login，就地显示登录卡片；登录成功整页刷新进入工作台。
 */
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { GoldFlakes, PaperCredits } from '@/components/page-shell';

export function ContentOpsGate() {
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
        window.location.href = '/content-ops';
      }
    } catch {
      setError('登录失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg cream-foil">
      <GoldFlakes variant="light" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <nav className="flex items-center justify-between gap-2" aria-label="面包屑">
          <p className="text-sm font-bold text-stone-700">
            <span>🦞 导师访谈龙虾工作台</span>
          </p>
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="AI Career Companion 首页"
          >
            <Image
              src="/icons/raw-logo.png"
              alt="AI Career Companion"
              width={40}
              height={40}
              priority
              className="h-10 w-10"
            />
            <span className="text-base font-medium text-stone-600">AI Career Companion</span>
          </Link>
        </nav>
      </div>

      <main className="relative z-10 flex flex-1 justify-center px-4 py-10 md:py-14">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="font-serif text-2xl font-bold text-ink">工作台登录</h1>
            <p className="mt-2 text-xs text-stone-500">登录进入导师访谈龙虾工作台</p>
          </div>
          <form onSubmit={handleSubmit} className="letter-paper space-y-4 rounded-[20px] p-6">
            {error && (
              <div className="bg-danger/10 text-danger animate-fade-in rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">手机号</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">密码</label>
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
            <div className="text-right">
              <Link
                href={`/forgot-password${phone ? `?target=${encodeURIComponent(phone)}` : ''}`}
                className="text-xs text-accent hover:underline"
              >
                忘记密码？
              </Link>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </main>

      <div className="relative z-10">
        <PaperCredits />
      </div>
    </div>
  );
}
