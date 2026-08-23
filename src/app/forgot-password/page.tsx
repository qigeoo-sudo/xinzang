'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';

type ResetMethod = 'phone' | 'email';
type Step = 'request' | 'verify' | 'reset' | 'done';

function ForgotPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMethod = (searchParams.get('method') as ResetMethod) || 'phone';
  const initialTarget = searchParams.get('target') || '';

  const [method, setMethod] = useState<ResetMethod>(initialMethod);
  const [target, setTarget] = useState(initialTarget);
  const [verifyCode, setVerifyCode] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<Step>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const isValidPhone = (val: string) => /^1[3-9]\d{9}$/.test(val);
  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const validatePassword = (val: string): string => {
    if (val.length === 0) return '';
    if (val.length < 8) return '密码至少需要8位字符';
    if (!/[a-zA-Z]/.test(val) || !/[0-9]/.test(val)) return '密码必须包含字母和数字';
    return '';
  };

  const validateConfirmPassword = (val: string): string => {
    if (val.length === 0) return '';
    if (val !== newPassword) return '两次输入的密码不一致';
    return '';
  };

  // 发送重置验证码
  const handleSendCode = async () => {
    setError('');
    setInfo('');

    if (method === 'phone' && !isValidPhone(target)) {
      setError('请输入有效的手机号码');
      return;
    }
    if (method === 'email' && !isValidEmail(target)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '发送验证码失败');
        return;
      }
      if (data.code) {
        setSentCode(data.code);
        setVerifyCode(data.code);
        setInfo(`验证码：${data.code}（Mock 模式，未真实发送）`);
      } else {
        setInfo(method === 'phone' ? '验证码已发送到你的手机' : '重置密码邮件已发送到你的邮箱');
      }
      setStep('verify');
    } catch {
      setError('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  // 验证验证码
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!verifyCode) {
      setError('请输入验证码');
      return;
    }
    if (sentCode && verifyCode !== sentCode) {
      setError('验证码不正确');
      return;
    }

    setStep('reset');
  };

  // 重置密码
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('密码至少需要8位字符');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('密码必须包含字母和数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, target, code: verifyCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '重置密码失败');
        return;
      }
      setStep('done');
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
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-ink mb-2">重置密码</h1>
            <p className="text-sm text-muted">
              {method === 'phone' ? '通过手机号重置密码' : '通过邮箱重置密码'}
            </p>
          </div>

          {/* 步骤 1: 输入手机/邮箱 */}
          {step === 'request' && (
            <div className="card space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg">{error}</div>
              )}

              <div className="flex gap-2 p-1 bg-beige rounded-lg">
                <button
                  type="button"
                  onClick={() => { setMethod('phone'); setError(''); }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                    method === 'phone' ? 'bg-white text-accent shadow-sm' : 'text-muted'
                  }`}
                >
                  手机找回
                </button>
                <button
                  type="button"
                  onClick={() => { setMethod('email'); setError(''); }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                    method === 'email' ? 'bg-white text-accent shadow-sm' : 'text-muted'
                  }`}
                >
                  邮箱找回
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  {method === 'phone' ? '手机号' : '邮箱'}
                </label>
                <input
                  type={method === 'phone' ? 'tel' : 'email'}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  required
                  className="input-field"
                />
              </div>

              <button
                type="button"
                onClick={handleSendCode}
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? '发送中...' : method === 'phone' ? '发送短信验证码' : '发送重置邮件'}
              </button>
            </div>
          )}

          {/* 步骤 2: 输入验证码 */}
          {step === 'verify' && (
            <form onSubmit={handleVerify} className="card space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg">{error}</div>
              )}
              {info && (
                <div className="bg-success/10 text-success text-sm px-4 py-3 rounded-lg">{info}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">验证码</label>
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

              <button type="submit" className="btn-primary w-full">下一步</button>
              <button
                type="button"
                onClick={() => { setStep('request'); setError(''); setInfo(''); }}
                className="w-full text-sm text-muted hover:text-ink transition-colors"
              >
                返回
              </button>
            </form>
          )}

          {/* 步骤 3: 设置新密码 */}
          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="card space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  新密码 <span className="text-muted text-xs font-normal">（至少8位，必须包含字母和数字）</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPasswordError('');
                    }}
                    onBlur={() => setPasswordError(validatePassword(newPassword))}
                    required
                    minLength={8}
                    maxLength={64}
                    autoComplete="new-password"
                    className={`input-field pr-12 ${passwordError ? 'border-red-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-ink"
                  >
                    {showPassword ? '隐藏' : '显示'}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">确认新密码</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setConfirmPasswordError('');
                    }}
                    onBlur={() => setConfirmPasswordError(validateConfirmPassword(confirmPassword))}
                    required
                    minLength={8}
                    maxLength={64}
                    autoComplete="new-password"
                    className={`input-field pr-12 ${confirmPasswordError ? 'border-red-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-ink"
                  >
                    {showConfirmPassword ? '隐藏' : '显示'}
                  </button>
                </div>
                {confirmPasswordError && <p className="text-xs text-red-500 mt-1">{confirmPasswordError}</p>}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? '重置中...' : '重置密码'}
              </button>
            </form>
          )}

          {/* 步骤 4: 完成 */}
          {step === 'done' && (
            <div className="card text-center py-8 animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#5B8C5A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">密码重置成功！</h3>
              <p className="text-sm text-muted mb-4">请使用新密码登录</p>
              <Link href="/login" className="btn-primary inline-block">去登录</Link>
            </div>
          )}

          <p className="text-center text-sm text-muted mt-6">
            <Link href="/login" className="text-accent font-medium hover:underline">
              返回登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
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
      <ForgotPasswordForm />
    </Suspense>
  );
}
