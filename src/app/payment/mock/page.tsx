'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';

function MockPaymentContent() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get('orderNo');

  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

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
        // 2秒后自动关闭
        setTimeout(() => {
          window.close();
        }, 2000);
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
    <div className="min-h-screen flex flex-col bg-beige">
      <Header />

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* 模拟微信支付界面 */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-lg">
            {/* 顶部 */}
            <div className="bg-[#07C160] text-white px-6 py-4 text-center">
              <p className="text-sm">微信支付 (模拟)</p>
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
                  <p className="text-xs text-muted mt-2">窗口将自动关闭...</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted mb-2">AI Career Companion</p>
                  <p className="text-3xl font-bold text-ink">
                    ￥{orderNo ? '订阅费用' : '--'}
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
                  <div className="w-8 h-8 rounded-lg bg-[#07C160] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">微</span>
                  </div>
                  <span className="text-sm text-ink flex-1">微信支付</span>
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
                  className="w-full bg-[#07C160] text-white py-3 rounded-lg font-medium text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  {paying ? '支付中...' : '确认支付 (模拟)'}
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
