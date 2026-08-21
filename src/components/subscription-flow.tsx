'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { SubscriptionPlan, PlanId } from '@/lib/plans';

interface SubscriptionFlowProps {
  plans: SubscriptionPlan[];
  currentPlanId?: PlanId;
  isPremium?: boolean;
  from?: string;
}

type PayState = 'idle' | 'creating' | 'paying' | 'polling' | 'success' | 'error';

/** 支付方式 */
type PaymentMethod = 'wechat' | 'alipay';

// 套餐等级映射 (用于判断升降级)
const planRank: Record<PlanId, number> = {
  MONTHLY: 1,
  QUARTERLY: 2,
  YEARLY: 3,
};

export function SubscriptionFlow({ plans, currentPlanId, isPremium, from }: SubscriptionFlowProps) {
  const router = useRouter();
  const { update } = useSession();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [payState, setPayState] = useState<PayState>('idle');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState('');

  // 弹窗状态
  const [showPayModal, setShowPayModal] = useState(false);
  const [modalPlan, setModalPlan] = useState<{ planId: string; isRenewal: boolean } | null>(null);

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
              const fromParam = from ? `&from=${encodeURIComponent(from)}` : '';
              router.push(`/payment/success?orderNo=${data.orderNo}${fromParam}`);
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

  // 用户点击套餐的支付按钮 — 弹出支付方式选择弹窗
  const handlePlanClick = (planId: string, isRenewal = false) => {
    setModalPlan({ planId, isRenewal });
    setShowPayModal(true);
  };

  // 用户在弹窗中选择支付方式 — 开始创建订单
  const handlePay = async (method: PaymentMethod) => {
    if (!modalPlan) return;

    setShowPayModal(false);
    setSelectedPlan(modalPlan.planId);
    setPayState('creating');
    setError('');

    try {
      const res = await fetch('/api/payment/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: modalPlan.planId,
          paymentMethod: method,
          isRenewal: modalPlan.isRenewal,
        }),
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
          // 使用相对路径，避免 HTTPS 预览环境下 http:// 被浏览器拦截
          const mockUrl = data.payUrl.replace(/^https?:\/\/[^/]+/, '');
          const fromParam = from ? `&from=${encodeURIComponent(from)}` : '';
          // 在 query string 中追加 from 参数
          const mockUrlWithFrom = mockUrl.includes('?')
            ? `${mockUrl}${fromParam}`
            : `${mockUrl}?from=${encodeURIComponent(from || '')}`;
          window.open(mockUrlWithFrom, '_blank');
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

  // 判断某个方案是否被禁用 (低于或等于当前等级，但年度会员可续费年度)
  const isPlanDisabled = (planId: PlanId): boolean => {
    if (!isPremium || !currentPlanId) return false;
    // 年度会员可以续费年度
    if (currentPlanId === 'YEARLY' && planId === 'YEARLY') return false;
    return planRank[planId] <= planRank[currentPlanId];
  };

  // 判断某个方案是否是续费方案（年度会员续费年度）
  const isRenewalPlan = (planId: PlanId): boolean => {
    return !!isPremium && currentPlanId === 'YEARLY' && planId === 'YEARLY';
  };

  // 判断某个方案是否是当前方案
  const isCurrentPlan = (planId: PlanId): boolean => {
    return !!isPremium && currentPlanId === planId && !isRenewalPlan(planId);
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
                : '请在支付页面完成支付'}
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
    <>
      {error && (
        <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
          {error}
        </div>
      )}

      {/* 已是会员时的提示 */}
      {isPremium && currentPlanId && (
        <div className="bg-accent/10 text-accent text-sm px-4 py-3 rounded-lg text-center">
          {currentPlanId === 'YEARLY'
            ? '你当前是年度会员，可享受会员期内续费一年打8折的优惠。'
            : currentPlanId === 'MONTHLY'
              ? '你当前是月度会员，可选择更高级别方案升级'
              : '你当前是季度会员，可选择更高级别方案升级'}
        </div>
      )}

      <div className="space-y-5">
        {plans.map((plan) => {
        const disabled = isPlanDisabled(plan.id);
        const current = isCurrentPlan(plan.id);
        const renewal = isRenewalPlan(plan.id);
        const renewalPrice = Math.round(plan.price * 0.8 * 100) / 100;
        const isYearly = plan.id === 'YEARLY';
        const yearlyOn = isYearly && !disabled;

        return (
          <div
            key={plan.id}
            className={`relative rounded-2xl p-5 ${
              yearlyOn
                ? 'bg-gradient-to-br from-[#4088A8] via-[#34728F] to-[#22566B] text-white shadow-lg ring-2 ring-[#7FB07F]/70'
                : `card ${plan.popular && !disabled ? 'border-accent border-2' : ''}`
            } ${disabled ? 'opacity-50 grayscale' : ''}`}
            style={plan.id === 'MONTHLY' && !disabled ? { borderColor: '#cbd5e1' } : undefined}
          >
            {yearlyOn ? (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="tag text-xs px-3 py-0.5 bg-[#7FB07F] text-white">
                  尊享
                </span>
              </div>
            ) : plan.popular && !disabled ? (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="tag text-xs px-3 py-0.5 bg-accent text-white">
                  推荐
                </span>
              </div>
            ) : null}

            {current && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="tag text-xs px-3 py-0.5 bg-success text-white">
                  当前方案
                </span>
              </div>
            )}

            {renewal && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="tag text-xs px-3 py-0.5 bg-accent text-white">
                  续费8折
                </span>
              </div>
            )}

            <div className="flex items-baseline justify-between mb-2">
              <h3 className={`font-semibold ${yearlyOn ? 'text-white' : 'text-ink'}`}>{plan.name}</h3>
              <div className="flex items-baseline gap-0.5">
                {renewal && (
                  <span className="text-xs text-muted line-through mr-1">￥{plan.price}</span>
                )}
                <span className={`text-xs ${yearlyOn ? 'text-[#EBE3D8]' : 'text-muted'}`}>￥</span>
                <span className={`text-2xl font-bold ${yearlyOn ? 'text-white' : 'text-accent'}`}>
                  {renewal ? renewalPrice : plan.price}
                </span>
                <span className={`text-xs ${yearlyOn ? 'text-[#EBE3D8]' : 'text-muted'}`}>{plan.period}</span>
              </div>
            </div>

            <p className={`text-xs mb-3 ${yearlyOn ? 'text-[#EBE3D8]' : 'text-muted'}`}>{plan.description}</p>

            <ul className="space-y-1.5 mb-4">
              {plan.features.map((feature, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-2 text-sm ${yearlyOn ? 'text-[#EBE3D8]' : 'text-ink'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke={yearlyOn ? '#7FB07F' : '#5B7C5A'}
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
                onClick={() => handlePlanClick(plan.id, renewal)}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                  yearlyOn
                    ? 'bg-white text-[#22566B] hover:bg-[#EBE3D8] font-semibold'
                    : plan.popular
                      ? 'bg-accent text-white hover:bg-accent-bright'
                      : 'bg-beige text-accent border border-accent hover:bg-sand'
                }`}
              >
                {renewal
                  ? `续费 ￥${renewalPrice}`
                  : isPremium
                    ? `升级到 ￥${plan.price}`
                    : `支付 ￥${plan.price}`}
              </button>
            )}
          </div>
        );
      })}
      </div>

      {/* 支付方式选择弹窗 */}
      {showPayModal && modalPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
          onClick={() => setShowPayModal(false)}
        >
          <div
            className="bg-white rounded-2xl px-6 pt-7 pb-5 mx-4 max-w-[320px] w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-[15px] font-medium text-ink mb-5">
              选择支付方式
            </p>

            <div className="space-y-3">
              {/* 微信支付 */}
              <button
                type="button"
                onClick={() => handlePay('wechat')}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-[#07C160] bg-[#07C160]/5 transition-all active:scale-95"
              >
                <div className="w-8 h-8 rounded-lg bg-[#07C160] flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-ink flex-1 text-left">微信支付</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#07C160" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* 支付宝 */}
              <button
                type="button"
                onClick={() => handlePay('alipay')}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-[#1677FF] bg-[#1677FF]/5 transition-all active:scale-95"
              >
                <div className="w-8 h-8 rounded-lg bg-[#1677FF] flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-ink flex-1 text-left">支付宝</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1677FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            {/* 取消支付 */}
            <div className="text-center mt-5">
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="text-sm text-muted hover:text-danger transition-colors"
              >
                取消支付
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
