'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';

type RegMethod = 'phone' | 'email';
type Step = 'form' | 'verify' | 'success';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted">加载中...</p></div>}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [method, setMethod] = useState<RegMethod>('phone');
  const [step, setStep] = useState<Step>('form');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // 手机号校验
  const isValidPhone = (val: string) => /^1[3-9]\d{9}$/.test(val);
  // 邮箱校验
  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  // 发送验证码（mock）
  const handleSendCode = async () => {
    setError('');
    setInfo('');

    if (method === 'phone') {
      if (!isValidPhone(phone)) {
        setError('请输入有效的手机号码');
        return;
      }
    } else {
      if (!isValidEmail(email)) {
        setError('请输入有效的邮箱地址');
        return;
      }
    }

    if (password.length < 8) {
      setError('密码至少需要8位字符');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, target: method === 'phone' ? phone : email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '发送验证码失败');
        return;
      }
      // Mock 模式下返回验证码
      if (data.code) {
        setSentCode(data.code);
        setInfo(`验证码已发送（模拟：${data.code}）`);
      } else {
        setInfo(method === 'phone' ? '验证码已发送到你的手机' : '验证邮件已发送到你的邮箱');
      }
      setStep('verify');
    } catch {
      setError('网络错误，请稍后再试');
    } finally {
      setSendingCode(false);
    }
  };

  // 验证并注册
  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (verifyCode !== sentCode && sentCode) {
      setError('验证码不正确');
      return;
    }
    if (!verifyCode) {
      setError('请输入验证码');
      return;
    }

    setLoading(true);
    try {
      const target = method === 'phone' ? phone : email;
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          target,
          password,
          code: verifyCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '注册失败');
        return;
      }

      // 注册成功后自动登录
      const result = await signIn('credentials', {
        email: method === 'phone' ? phone : email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        // 使用完整页面跳转确保 session cookie 生效后再渲染受保护页面
        window.location.href = callbackUrl;
      } else {
        setStep('success');
      }
    } catch {
      setError('网络错误，请稍后再试');
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
            <h1 className="text-2xl font-bold text-ink mb-2">创建账号</h1>
          </div>

          {/* 表单卡片 */}
          {step === 'form' && (
            <div className="card space-y-4">
              {/* 错误提示 */}
              {error && (
                <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
                  {error}
                </div>
              )}

              {/* 注册方式切换 */}
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
                  手机注册
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
                  邮箱注册
                </button>
              </div>

              {/* 手机/邮箱输入 */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  {method === 'phone' ? '手机号' : '邮箱'}
                </label>
                <input
                  type={method === 'phone' ? 'tel' : 'email'}
                  value={method === 'phone' ? phone : email}
                  onChange={(e) =>
                    method === 'phone'
                      ? setPhone(e.target.value)
                      : setEmail(e.target.value)
                  }
                  required
                  autoComplete={method === 'phone' ? 'tel' : 'email'}
                  className="input-field"
                />
              </div>

              {/* 密码 */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  密码 <span className="text-muted text-xs font-normal">（任意8位或以上字母或数字）</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input-field"
                />
              </div>

              {/* 确认密码 */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  确认密码
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input-field"
                />
              </div>

              {/* 发送验证码按钮 */}
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode}
                className="btn-primary w-full"
              >
                {sendingCode
                  ? '发送中...'
                  : method === 'phone'
                    ? '发送短信验证码'
                    : '发送邮箱验证'}
              </button>
            </div>
          )}

          {/* 验证步骤 */}
          {step === 'verify' && (
            <form onSubmit={handleVerifyAndRegister} className="card space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
                  {error}
                </div>
              )}
              {info && (
                <div className="bg-accent/10 text-accent text-sm px-4 py-3 rounded-lg animate-fade-in">
                  {info}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  验证码
                </label>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="请输入6位验证码"
                  maxLength={6}
                  required
                  className="input-field text-center text-lg tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? '注册中...' : '验证并注册'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('form'); setError(''); setInfo(''); }}
                className="w-full text-sm text-muted hover:text-ink transition-colors"
              >
                返回修改
              </button>
            </form>
          )}

          {/* 注册成功 */}
          {step === 'success' && (
            <div className="card text-center py-8 animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">注册成功！</h3>
              <p className="text-sm text-muted mb-4">请登录以继续</p>
              <Link href={callbackUrl && callbackUrl !== '/' ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'} className="btn-primary inline-block">
                去登录
              </Link>
            </div>
          )}

          {/* 登录引导 */}
          {step !== 'success' && (
            <p className="text-center text-sm text-muted mt-6">
              已有账号？{' '}
              <Link href={callbackUrl && callbackUrl !== '/' ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'} className="text-accent font-medium hover:underline">
                直接登录
              </Link>
            </p>
          )}

          {/* 隐私提示 */}
          <p className="text-center text-xs text-muted mt-4 leading-relaxed">
            我们仅收集必要的职业信息，你可以随时更新个人信息。
          </p>
        </div>
      </div>
    </div>
  );
}
