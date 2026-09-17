'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { GoldFlakes, PaperCredits } from '@/components/page-shell';

function MockPaymentContent() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get('orderNo');
  const method = searchParams.get('method') || 'wechat';
  const amount = searchParams.get('amount') || '';
  const from = searchParams.get('from');

  const isWechat = method === 'wechat';

  // 微信 / 支付宝配色
  const brandColor = isWechat ? '#07C160' : '#1677FF';
  const brandLabel = isWechat ? '微信支付' : '支付宝';
  const brandIcon = isWechat ? '微' : '支';

  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // 成功后的去向：
  // - 当前窗口进入（正常流程）：短暂展示成功状态后直接跳成功页
  // - 弹窗进入（兼容旧入口）：通知父窗口并尝试关窗，关不掉则自身跳转
  useEffect(() => {
    if (!success || !orderNo) return;

    const successUrl = `/payment/success?orderNo=${orderNo}${
      from ? `&from=${encodeURIComponent(from)}` : ''
    }`;

    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'mock-pay-success', orderNo }, '*');
      } catch {
        // 忽略跨域错误
      }
      const closeTimer = setTimeout(() => {
        window.close();
      }, 2000);
      const redirectTimer = setTimeout(() => {
        window.location.href = successUrl;
      }, 2500);
      return () => {
        clearTimeout(closeTimer);
        clearTimeout(redirectTimer);
      };
    }

    const timer = setTimeout(() => {
      window.location.href = successUrl;
    }, 1200);
    return () => clearTimeout(timer);
  }, [success, orderNo, from]);

  const handleMockPay = async () => {
    if (!orderNo) return;

    setPaying(true);
    setError('');

    try {
      const res = await fetch('/api/payment/mock-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || '支付失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-bg cream-foil overflow-hidden">
      <Header />
      <GoldFlakes />

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* 模拟支付界面 — 暖白信纸 */}
          <div className="letter-paper rounded-[20px] overflow-hidden">
            {/* 顶部 */}
            <div className="text-white px-6 py-4 text-center" style={{ backgroundColor: brandColor }}>
              <p className="text-sm">{brandLabel} (模拟)</p>
            </div>

            {/* 金额 */}
            <div className="px-6 py-8 text-center border-b border-rule">
              {success ? (
                <>
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-success/10 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="#5B8C5A"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-success">支付成功</p>
                  <p className="text-xs text-muted mt-2">正在返回...</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted mb-2">AI Career Companion</p>
                  <p className="text-3xl font-bold text-ink">
                    ￥{amount || '--'}
                  </p>
                  <p className="text-xs text-muted mt-2">
                    订单号: {orderNo || '未知'}
                  </p>
                </>
              )}
            </div>

            {/* 支付方式 */}
            {!success && (
              <div className="px-6 py-4">
                <div className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandColor }}>
                    <span className="text-white text-xs font-bold">{brandIcon}</span>
                  </div>
                  <span className="text-sm text-ink flex-1">{brandLabel}</span>
                  <div className="w-5 h-5 rounded-full border-2 border-accent flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                  </div>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="px-6 pb-2">
                <p className="text-xs text-danger text-center">{error}</p>
              </div>
            )}

            {/* 支付按钮 */}
            {!success && (
              <div className="px-6 pb-6">
                <button
                  onClick={handleMockPay}
                  disabled={paying || !orderNo}
                  className="w-full text-white py-3 rounded-lg font-medium text-sm transition-all active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: brandColor }}
                >
                  {paying ? '支付中...' : `确认支付 (模拟)`}
                </button>
                <p className="text-xs text-muted text-center mt-3">
                  这是开发环境的模拟支付页面
                  <br />
                  点击按钮模拟支付成功
                </p>
              </div>
            )}
          </div>

          {/* 安全提示 */}
          <p className="text-center text-xs text-muted mt-4">
            模拟支付环境 . 不会产生真实交易
          </p>
        </div>
      </div>

      <PaperCredits lang="zh" />
    </div>
  );
}

export default function MockPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted">加载中...</p>
        </div>
      }
    >
      <MockPaymentContent />
    </Suspense>
  );
}
