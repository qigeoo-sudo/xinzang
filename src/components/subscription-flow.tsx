'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { SubscriptionPlan, PlanId } from '@/lib/plans';

interface SubscriptionFlowProps {
  plans: SubscriptionPlan[];
  currentPlanId?: PlanId;
  isPremium?: boolean;
}

type PayState = 'idle' | 'creating' | 'paying' | 'polling' | 'success' | 'error';

// 套餐等级映射 (用于判断升降级)
const planRank: Record<PlanId, number> = {
  MONTHLY: 1,
  QUARTERLY: 2,
  YEARLY: 3,
};

export function SubscriptionFlow({ plans, currentPlanId, isPremium }: SubscriptionFlowProps) {
  const router = useRouter();
  const { update } = useSession();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [payState, setPayState] = useState<PayState>('idle');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState('');

  // 轮询订单状态
  const pollOrderStatus = useCallback(
    async (id: string) => {
      let attempts = 0;
      const maxAttempts = 60;

      const poll = async () => {
        if (attempts >= maxAttempts) {
          setPayState('error');
          setError('支付超时，请重试');
          return;
        }

        attempts++;

        try {
          const res = await fetch(`/api/payment/orders/${id}`);
          const data = await res.json();

          if (data.status === 'PAID') {
            setPayState('success');
            // 刷新 JWT session — 确保客户端 isPremium 立即更新
            try {
              await update();
            } catch {
              // 刷新失败不阻塞流程
            }
            setTimeout(() => {
              router.push('/payment/success?orderNo=' + data.orderNo);
              router.refresh();
            }, 1500);
            return;
          }

          if (data.status === 'EXPIRED' || data.status === 'FAILED') {
            setPayState('error');
            setError('支付失败或订单已过期');
            return;
          }

          setTimeout(poll, 2000);
        } catch {
          setTimeout(poll, 2000);
        }
      };

      poll();
    },
    [router]
  );

  const handlePay = async (planId: string) => {
    setSelectedPlan(planId);
    setPayState('creating');
    setError('');

    try {
      const res = await fetch('/api/payment/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '创建订单失败');
        setPayState('error');
        return;
      }

      setOrderId(data.orderId);
      setOrderNo(data.orderNo);
      setPayUrl(data.payUrl);
      setIsMock(data.mock || false);
      setPayState('paying');

      if (data.mock) {
        if (data.payUrl) {
          window.open(data.payUrl, '_blank');
        }
        setPayState('polling');
        pollOrderStatus(data.orderId);
      } else {
        if (data.payUrl) {
          window.location.href = data.payUrl;
        }
        setPayState('polling');
        pollOrderStatus(data.orderId);
      }
    } catch {
      setError('网络错误，请稍后再试');
      setPayState('error');
    }
  };

  const handleMockPay = async () => {
    if (!orderNo) return;

    try {
      const res = await fetch('/api/payment/mock-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo }),
      });

      const data = await res.json();

      if (data.success) {
        // 轮询会检测到支付成功
      } else {
        setError(data.error || 'Mock 支付失败');
        setPayState('error');
      }
    } catch {
      setError('网络错误');
      setPayState('error');
    }
  };

  const handleReset = () => {
    setSelectedPlan(null);
    setPayState('idle');
    setOrderId(null);
    setOrderNo(null);
    setPayUrl(null);
    setError('');
  };

  // 判断某个方案是否被禁用 (低于或等于当前等级)
  const isPlanDisabled = (planId: PlanId): boolean => {
    if (!isPremium || !currentPlanId) return false;
    return planRank[planId] <= planRank[currentPlanId];
  };

  // 判断某个方案是否是当前方案
  const isCurrentPlan = (planId: PlanId): boolean => {
    return !!isPremium && currentPlanId === planId;
  };

  // === 渲染: 支付成功 ===
  if (payState === 'success') {
    return (
      <div className="card text-center py-8 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#5B8C5A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-ink mb-2">支付成功!</h3>
        <p className="text-sm text-muted">正在跳转到会员页面...</p>
      </div>
    );
  }

  // === 渲染: 支付中/轮询 ===
  if (payState === 'paying' || payState === 'polling') {
    return (
      <div className="card text-center py-8 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 relative">
          <div className="absolute inset-0 rounded-full border-4 border-beige" />
          <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin" />
        </div>

        <h3 className="text-lg font-bold text-ink mb-2">
          {payState === 'polling' ? '等待支付结果...' : '正在创建订单...'}
        </h3>

        {orderNo && (
          <p className="text-xs text-muted mb-4">订单号: {orderNo}</p>
        )}

        {payState === 'polling' && (
          <div className="bg-beige rounded-lg p-4 mb-4 text-left">
            <p className="text-sm text-ink mb-2">
              {isMock
                ? '开发模式: 点击下方按钮模拟支付成功'
                : '请在微信中完成支付'}
            </p>
            {isMock && (
              <button
                onClick={handleMockPay}
                className="btn-primary w-full text-sm"
              >
                模拟支付成功
              </button>
            )}
          </div>
        )}

        <button
          onClick={handleReset}
          className="text-sm text-muted hover:text-danger transition-colors"
        >
          取消支付
        </button>
      </div>
    );
  }

  // === 渲染: 错误 ===
  if (payState === 'error') {
    return (
      <div className="card text-center py-8 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M6 18L18 6" stroke="#C0654A" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-ink mb-2">支付失败</h3>
        <p className="text-sm text-muted mb-4">{error}</p>
        <button onClick={handleReset} className="btn-primary">
          重新选择方案
        </button>
      </div>
    );
  }

  // === 渲染: 方案选择 ===
  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
          {error}
        </div>
      )}

      {/* 已是会员时的升级提示 */}
      {isPremium && currentPlanId && (
        <div className="bg-accent/10 text-accent text-sm px-4 py-3 rounded-lg text-center">
          你当前是{currentPlanId === 'MONTHLY' ? '月度' : currentPlanId === 'QUARTERLY' ? '季度' : '年度'}会员，可选择更高级别方案升级
        </div>
      )}

      {plans.map((plan) => {
        const disabled = isPlanDisabled(plan.id);
        const current = isCurrentPlan(plan.id);

        return (
          <div
            key={plan.id}
            className={`card relative ${
              plan.popular && !disabled ? 'border-accent border-2' : ''
            } ${disabled ? 'opacity-50 grayscale' : ''}`}
          >
            {plan.popular && !disabled && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="tag text-xs px-3 py-0.5 bg-accent text-white">
                  推荐
                </span>
              </div>
            )}

            {current && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="tag text-xs px-3 py-0.5 bg-success text-white">
                  当前方案
                </span>
              </div>
            )}

            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-semibold text-ink">{plan.name}</h3>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs text-muted">￥</span>
                <span className="text-2xl font-bold text-accent">
                  {plan.price}
                </span>
                <span className="text-xs text-muted">{plan.period}</span>
              </div>
            </div>

            <p className="text-xs text-muted mb-3">{plan.description}</p>

            <ul className="space-y-1.5 mb-4">
              {plan.features.map((feature, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-ink"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="#5B7C5A"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            {current ? (
              <div className="w-full py-2.5 rounded-lg text-sm font-medium text-center bg-beige text-muted">
                当前方案
              </div>
            ) : disabled ? (
              <div className="w-full py-2.5 rounded-lg text-sm font-medium text-center bg-slate-100 text-slate-400 cursor-not-allowed">
                不可降级
              </div>
            ) : (
              <button
                onClick={() => handlePay(plan.id)}
                disabled={payState === 'creating'}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                  plan.popular
                    ? 'bg-accent text-white hover:bg-accent-bright'
                    : 'bg-beige text-accent border border-accent hover:bg-sand'
                } disabled:opacity-50`}
              >
                {payState === 'creating' && selectedPlan === plan.id
                  ? '创建订单中...'
                  : isPremium
                    ? `升级到 ￥${plan.price}`
                    : `微信支付 ￥${plan.price}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
