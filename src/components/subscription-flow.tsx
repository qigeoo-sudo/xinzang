'use client';

import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { SubscriptionPlan, PlanId, CreditPack } from '@/lib/plans';
import {
  calcCreditPackPriceFen,
  formatPriceFen,
  getCreditPackDiscount,
  CREDIT_PACK_MAX_QTY,
  CREDIT_PACK_MAX_BALANCE,
  YEARLY_RENEWAL_CAP_DAYS,
} from '@/lib/plans';

import { PaperCredits, GoldFlakes } from '@/components/page-shell';

/** 当前生效订阅（卡内显示到期时间/剩余天数） */
export interface ActiveSubscriptionInfo {
  plan: PlanId;
  endDate: string; // ISO 日期字符串
  daysRemaining: number;
}

interface SubscriptionFlowProps {
  plans: SubscriptionPlan[];
  creditPacks: CreditPack[];
  currentPlanId?: PlanId;
  isPremium?: boolean;
  from?: string;
  activeSubscription?: ActiveSubscriptionInfo | null;
  freeTrialRemaining?: number;
  freeTrialLimit?: number;
  /** 多榨卡当前持有轮次余额（累计购买 − 累计消耗） */
  creditBalance?: number;
  /** 用户昵称（印在生效卡上，仿信用卡持卡人姓名） */
  nickname?: string;
}

type PayState = 'idle' | 'creating' | 'paying' | 'polling' | 'success' | 'error';

/**
 * 卡面压印名（仿信用卡持卡人姓名）：绝对定位不占卡面高度。
 * 右边缘与右上描述块右齐（同一网格列，由布局保证）；宽度统一以
 * 年卡描述"享受最低价格，主打长期陪伴"的 9px 渲染宽度为上限（三张卡同一把尺），
 * 从 18px 起按比例一次算到合适字号（0.5px 向下取整），下限 8px。
 * 只监听标尺/容器，不监听自身，杜绝自触发循环。
 */
function EmbossedName({
  name,
  isBlack,
  gaugeRef,
}: {
  name: string;
  isBlack: boolean;
  gaugeRef: RefObject<HTMLDivElement>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(18);

  useEffect(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    const gauge = gaugeRef.current;
    if (!wrap || !text || !gauge) return;

    const fit = () => {
      const max = gauge.getBoundingClientRect().width;
      if (!max) return;
      // 只在 18px 测一次真实宽度，再按比例一次算出目标字号（0.5px 向下取整保证不超）
      text.style.fontSize = '18px';
      const w18 = text.getBoundingClientRect().width;
      let size = 18;
      if (w18 > max) {
        size = Math.max(8, Math.floor(((18 * max) / w18) * 2) / 2);
      }
      text.style.fontSize = '';
      setFontSize(size);
    };

    const raf = requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    ro.observe(gauge);
    let disposed = false;
    document.fonts?.ready
      .then(() => {
        if (!disposed) fit();
      })
      .catch(() => {});
    window.addEventListener('resize', fit);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [name, gaugeRef]);

  return (
    <div ref={wrapRef} className="relative h-0 w-full">
      <span
        ref={textRef}
        title={name}
        style={{ fontSize }}
        className={`absolute right-0 top-0 whitespace-nowrap font-mono font-bold leading-none ${
          isBlack ? 'text-foil' : 'text-foil-light'
        }`}
      >
        {/[\u4e00-\u9fa5]/.test(name) ? name : name.toUpperCase()}
      </span>
    </div>
  );
}

/** 支付方式 */
type PaymentMethod = 'wechat' | 'alipay';

// 套餐等级映射 (用于判断升降级)
const planRank: Record<PlanId, number> = {
  MONTHLY: 1,
  QUARTERLY: 2,
  YEARLY: 3,
};

export function SubscriptionFlow({
  plans,
  creditPacks,
  currentPlanId,
  isPremium,
  from,
  activeSubscription = null,
  freeTrialRemaining = 0,
  freeTrialLimit = 3,
  creditBalance = 0,
  nickname,
}: SubscriptionFlowProps) {
  const router = useRouter();
  const { update } = useSession();

  // 生效卡：压印名的统一宽度标尺（年卡描述文字的 9px 渲染宽），三张卡共用
  const nameGaugeRef = useRef<HTMLDivElement>(null);

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [payState, setPayState] = useState<PayState>('idle');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState('');

  // 弹窗状态
  const [showPayModal, setShowPayModal] = useState(false);
  const [modalPlan, setModalPlan] = useState<{ planId: string; isRenewal: boolean; quantity?: number } | null>(null);

  // 多榨卡购买数量（可一次多买，享受批量折扣）
  const [packQty, setPackQty] = useState(1);

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
            // update({}) 传参才会触发服务端 trigger==='update' 重读数据库
            try {
              await update({});
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

  // 用户点击套餐的支付按钮 — 弹出支付方式选择弹窗（多榨卡带购买数量）
  const handlePlanClick = (planId: string, isRenewal = false, quantity = 1) => {
    // 年卡续满冻结：点击不起任何作用（按钮本身也已 disabled，双保险）
    if (isRenewal && planId === 'YEARLY' && yearlyRenewalFull) return;
    // 多榨卡持有上限冻结：余额 + 本次轮次 > 2970 时拦截（双保险）
    const pack = creditPacks.find((p) => p.id === planId);
    if (pack && creditBalance + pack.credits * quantity > CREDIT_PACK_MAX_BALANCE) return;
    setModalPlan({ planId, isRenewal, quantity });
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
          quantity: modalPlan.quantity ?? 1,
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
          // 当前窗口跳转到模拟收银台（与真实支付一致，也避免新窗口不继承设备模拟）
          // 收银台支付完成后会自行跳回 /payment/success，当前页即将卸载，不再轮询
          window.location.href = mockUrlWithFrom;
          return;
        }
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

  // 年卡已续满：来自年卡的剩余天数 > 1460 天（4 年），续费入口冻结
  const yearlyRenewalFull =
    !!activeSubscription &&
    activeSubscription.plan === 'YEARLY' &&
    activeSubscription.daysRemaining > YEARLY_RENEWAL_CAP_DAYS;

  // === 渲染: 支付成功 ===
  if (payState === 'success') {
    return (
      <div className="letter-paper rounded-[20px] text-center py-8 animate-fade-in">
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
      <div className="letter-paper rounded-[20px] text-center py-8 animate-fade-in">
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
      <div className="letter-paper rounded-[20px] text-center py-8 animate-fade-in">
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

      {/* 当前生效中的会员卡 — 占顶部主位，卡内直接显示到期时间/剩余天数 */}
      {activeSubscription && (() => {
        const activePlan = plans.find((p) => p.id === activeSubscription.plan);
        if (!activePlan) return null;
        const isBlack = activePlan.id === 'YEARLY';
        const cardClass =
          activePlan.id === 'MONTHLY' ? 'card-gold'
          : activePlan.id === 'QUARTERLY' ? 'card-sage'
          : 'card-black';
        return (
          <div className={`relative w-full max-w-[335px] mx-auto rounded-[20px] ${cardClass} aspect-[1.586/1] flex flex-col p-3.5 md:p-4 mb-7`}>
            {/* 生效中：中央顶部绿色底座 */}
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 tag text-xs px-3 py-0.5 bg-success text-white whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              生效中
            </span>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
              <p className={`font-mono text-[10px] font-medium uppercase tracking-masthead ${isBlack ? 'text-foil' : 'text-foil-light'}`}>
                {activePlan.id}
              </p>
              <div className="text-right">
                <p className={`font-serif text-[18px] font-bold ${isBlack ? 'text-foil' : 'text-foil-light'} leading-none`}>
                  {activePlan.name}
                </p>
                <p className={`text-[9px] mt-0.5 ${isBlack ? 'text-foil/60' : 'text-white/60'}`}>{activePlan.description}</p>
                {/* 统一宽度标尺：年卡描述的 9px 单行渲染宽；invisible+h-0 只占宽不占高，
                    三张卡的右列因此同宽，压印名一律与这把尺比较 */}
                <div
                  ref={nameGaugeRef}
                  aria-hidden
                  className="invisible h-0 overflow-hidden whitespace-nowrap text-[9px]"
                >
                  享受最低价格，主打长期陪伴
                </div>
              </div>

              <div className="mt-1 flex items-baseline gap-0.5">
                <span className={`text-[11px] ${isBlack ? 'text-foil/70' : 'text-white/70'}`}>￥</span>
                <span className={`text-[28px] font-bold ${isBlack ? 'text-foil' : 'text-foil-light'} leading-none`}>
                  {activePlan.price}
                </span>
                <span className={`text-[11px] ${isBlack ? 'text-foil/70' : 'text-white/70'}`}>{activePlan.period}</span>
              </div>
              <div aria-hidden />

              <ul className="mt-1.5 space-y-0">
                {activePlan.features.map((feature, i) => (
                  <li key={i} className={`flex items-center gap-1.5 text-[11px] leading-snug ${isBlack ? 'text-foil/85' : 'text-white/85'}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      <path d="M5 13l4 4L19 7" stroke={isBlack ? '#F5D785' : '#FFFFFF'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              {/* 压印名：与第一条权益顶部齐平；右列左右边界与右上卡名/描述块一致，超宽自动缩字号 */}
              <div className="mt-1.5">
                {nickname && <EmbossedName name={nickname} isBlack={isBlack} gaugeRef={nameGaugeRef} />}
              </div>
            </div>

            <div className={`mt-auto pt-1 text-right text-[10px] ${isBlack ? 'text-foil/75' : 'text-white/75'}`}>
              {new Date(activeSubscription.endDate).toLocaleDateString('zh-CN')} 到期 · 剩余 {activeSubscription.daysRemaining} 天
            </div>
          </div>
        );
      })()}

      {/* 生效卡与其他方案之间：首页同款全小写英文标语（字号随屏宽自适应、单行） */}
      {activeSubscription && (
        <p className="masthead-label mb-7 text-white/80">
          navigate around any singularity, shape your future
        </p>
      )}

      {/* 非会员：免费试用剩余次数 — 低调一行小字 */}
      {!isPremium && (
        <p className="text-center text-xs text-muted mb-4">
          当前为非会员用户 · 剩余免费试用导师分身次数 {freeTrialRemaining} / {freeTrialLimit} 次
        </p>
      )}

      <div className="space-y-5">
        {plans
          // 当前方案卡已置顶为"生效中"；年卡续费入口保留
          .filter((plan) => plan.id !== currentPlanId || isRenewalPlan(plan.id))
          .map((plan) => {
        const disabled = isPlanDisabled(plan.id);
        const renewal = isRenewalPlan(plan.id);

        // 信用卡色系：月度=金 / 季度=鼠尾草绿 / 年度=黑
        const cardClass =
          plan.id === 'MONTHLY' ? 'card-gold'
          : plan.id === 'QUARTERLY' ? 'card-sage'
          : 'card-black';

        const isBlack = plan.id === 'YEARLY';

        return (
          <div
            key={plan.id}
            className={`relative w-full max-w-[335px] mx-auto rounded-[20px] ${cardClass} aspect-[1.586/1] flex flex-col p-3.5 md:p-4 ${disabled ? 'opacity-50 grayscale' : ''}`}
          >
            {/* 角标区：年卡续费入口 — 正常=绿色"续费"；剩余 >1460 天=橙色"续满"冻结 */}
            {renewal && (
              <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 tag text-xs px-3 py-0.5 text-white whitespace-nowrap ${yearlyRenewalFull ? 'bg-brand-500' : 'bg-accent'}`}>
                {yearlyRenewalFull ? '续满' : '续费'}
              </span>
            )}

            {/* 顶行：masthead + 方案名 */}
            <div className="flex items-start justify-between">
              <p className={`font-mono text-[10px] font-medium uppercase tracking-masthead ${isBlack ? 'text-foil' : 'text-foil-light'}`}>
                {plan.id}
              </p>
              <div className="text-right">
                <p className={`font-serif text-[18px] font-bold ${isBlack ? 'text-foil' : 'text-foil-light'} leading-none`}>
                  {plan.name.replace('会员', '')}
                </p>
                <p className={`text-[9px] mt-0.5 ${isBlack ? 'text-foil/60' : 'text-white/60'}`}>{plan.description}</p>
              </div>
            </div>

            {/* 价格 — 紧接顶行，不留空隙 */}
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className={`text-[11px] ${isBlack ? 'text-foil/70' : 'text-white/70'}`}>￥</span>
              <span className={`text-[28px] font-bold ${isBlack ? 'text-foil' : 'text-foil-light'} leading-none`}>
                {plan.price}
              </span>
              <span className={`text-[11px] ${isBlack ? 'text-foil/70' : 'text-white/70'}`}>{plan.period}</span>
            </div>

            {/* features 列表 — 单列紧凑排列；年卡 5 条也能放下，空白由底部 mt-auto 吸收 */}
            <ul className="mt-1.5 space-y-0">
              {plan.features.map((feature, i) => (
                <li key={i} className={`flex items-center gap-1.5 text-[11px] leading-snug ${isBlack ? 'text-foil/85' : 'text-white/85'}`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <path d="M5 13l4 4L19 7" stroke={isBlack ? '#F5D785' : '#FFFFFF'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            {/* 底部操作区 — 沉底，吸收剩余空间，不影响 features 行距 */}
            <div className="mt-auto pt-1 flex items-end justify-end">
              {disabled ? (
                <span className={`text-[10px] font-semibold uppercase tracking-masthead ${isBlack ? 'text-foil/40' : 'text-white/40'}`}>不可降级</span>
              ) : renewal && yearlyRenewalFull ? (
                <button
                  type="button"
                  disabled
                  aria-disabled
                  className="cursor-not-allowed rounded-md bg-foil/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-masthead text-black/60"
                >
                  续满 ￥{plan.price}
                </button>
              ) : (
                <button
                  onClick={() => handlePlanClick(plan.id, renewal)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-masthead transition-all active:scale-95 ${
                    isBlack
                      ? 'bg-foil text-black hover:bg-white'
                      : 'bg-white/95 text-brand-700 hover:bg-white'
                  }`}
                >
                  {renewal ? `续费 ￥${plan.price}` : isPremium ? `升级到 ￥${plan.price}` : `支付 ￥${plan.price}`}
                </button>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* 多榨卡 — 银灰缩小卡，区别于三张彩色会员信用卡 */}
      {creditPacks.length > 0 && (
        <div className="mt-7" id="credit-pack">
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-xs text-white/60 shrink-0">不想成为会员，也可以买次数</span>
            <span className="h-px flex-1 bg-white/15" />
          </div>

          <div className="space-y-4">
            {creditPacks.map((pack) => {
              const totalPriceFen = calcCreditPackPriceFen(pack, packQty);
              const discount = getCreditPackDiscount(packQty);
              const totalRounds = pack.credits * packQty;
              // 还能再买多少包：(2970 − 当前余额) / 每包轮次，向下取整
              const maxBuyable = Math.max(
                0,
                Math.floor((CREDIT_PACK_MAX_BALANCE - creditBalance) / pack.credits)
              );
              // 当前数量下购买后是否超过 2970 轮持有上限
              const packOverflow = creditBalance + totalRounds > CREDIT_PACK_MAX_BALANCE;
              return (
                <div
                  key={pack.id}
                  className="relative w-full max-w-[335px] mx-auto rounded-[20px] card-platinum px-4 py-3.5"
                >
                  {/* 榨干：当前选择会突破 2970 轮持有时显示红标 */}
                  {packOverflow && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 tag text-xs px-3 py-0.5 bg-coral-600 text-white whitespace-nowrap">
                      榨干
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    {/* 左：数量选择 */}
                    <div className="shrink-0">
                      <p className="font-serif text-[17px] font-bold text-ink leading-tight">多榨卡</p>
                      <p className="text-[10px] text-ink/60 mt-0.5">
                        {pack.credits}轮次/包 · 永不过期
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[10px] text-ink/70">数量</span>
                        <div className="flex items-center rounded-md border border-ink/20 overflow-hidden">
                          <button
                            type="button"
                            aria-label="减少数量"
                            disabled={packQty <= 1}
                            onClick={() => setPackQty((q) => Math.max(1, q - 1))}
                            className="w-6 h-6 text-sm leading-none text-ink hover:bg-ink/10 disabled:text-ink/30 disabled:hover:bg-transparent transition-colors"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-xs font-semibold text-ink select-none">
                            {packQty}
                          </span>
                          <button
                            type="button"
                            aria-label="增加数量"
                            disabled={packQty >= CREDIT_PACK_MAX_QTY || packQty >= maxBuyable}
                            onClick={() => setPackQty((q) => Math.min(CREDIT_PACK_MAX_QTY, maxBuyable, q + 1))}
                            className="w-6 h-6 text-sm leading-none text-ink hover:bg-ink/10 disabled:text-ink/30 disabled:hover:bg-transparent transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 分隔线 */}
                    <div className="h-14 w-px bg-ink/15 shrink-0" />

                    {/* 右：总价 + 支付 */}
                    <div className="flex-1 min-w-0 text-right">
                      <p className="text-[10px] text-ink/60 leading-none mb-1">
                        买5个9折 · 10个及以上8.5折
                      </p>
                      <div className="flex items-baseline justify-end gap-1.5">
                        {discount.label && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500 text-white font-medium">
                            {discount.label}
                          </span>
                        )}
                        <span className="text-[11px] text-ink/70">￥</span>
                        <span className="text-xl font-bold text-ink leading-none">
                          {formatPriceFen(totalPriceFen)}
                        </span>
                      </div>
                      <p className={`text-[9px] mt-1 ${packOverflow ? 'text-coral-600 font-semibold' : 'text-ink/50'}`}>
                        {packOverflow
                          ? '榨过上限了，请消耗点再来'
                          : `共 ${totalRounds} 轮次`}
                      </p>
                      <button
                        type="button"
                        disabled={packOverflow}
                        onClick={() => handlePlanClick(pack.id, false, packQty)}
                        className={`mt-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-masthead transition-all ${
                          packOverflow
                            ? 'bg-ink/15 text-ink/35 cursor-not-allowed'
                            : 'bg-ink text-white hover:bg-brand-700 active:scale-95'
                        }`}
                      >
                        支付
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 支付方式选择弹窗 */}
      {showPayModal && modalPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
          onClick={() => setShowPayModal(false)}
        >
          <div
            className="relative overflow-hidden bg-bg cream-foil rounded-2xl px-6 pt-7 pb-2 mx-4 max-w-[320px] w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <GoldFlakes count={1} stars={1} />
            <div className="relative z-10">
            <p className="text-center text-[15px] font-medium text-ink mb-5">
              选择支付方式
            </p>

            <div className="space-y-3">
              {/* 微信支付 */}
              <button
                type="button"
                onClick={() => handlePay('wechat')}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-[#07C160] bg-[#E7FAF1] transition-all active:scale-95"
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
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-[#1677FF] bg-[#E9F2FF] transition-all active:scale-95"
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

            <PaperCredits compact />
          </div>
        </div>
      )}
    </>
  );
}
