'use client';

import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { SubscriptionPlan, SingleMentorPlan, PlanId, CreditPack, SubscriptionScope } from '@/lib/plans';
import {
  calcCreditPackPriceFen,
  formatPriceFen,
  getCreditPackDiscount,
  CREDIT_PACK_MAX_QTY,
  CREDIT_PACK_MAX_BALANCE,
  YEARLY_RENEWAL_CAP_DAYS,
} from '@/lib/plans';

import { PaperCredits, GoldFlakes } from '@/components/page-shell';
import { track } from '@/lib/analytics/tracker';

/** 当前生效订阅（卡内显示到期时间/剩余天数） */
export interface ActiveSubscriptionInfo {
  plan: PlanId;
  scope: SubscriptionScope;
  mentorId: string | null;
  /** scope=SINGLE 时绑定分身的展示名 */
  boundMentorName?: string;
  endDate: string; // ISO 日期字符串
  daysRemaining: number;
}

interface SubscriptionFlowProps {
  plans: SubscriptionPlan[];
  singlePlans: SingleMentorPlan[];
  creditPacks: CreditPack[];
  currentPlanId?: PlanId;
  /** 当前生效卡的方案范围（无生效卡为 null） */
  currentScope?: SubscriptionScope | null;
  isPremium?: boolean;
  from?: string;
  /** 来源分身（付费链接/选我按钮带入），下单单导师卡时绑定 */
  sourceMentorId?: string;
  sourceMentorName?: string;
  /** 初始标签：单导师付费（默认）/ 全导师付费 */
  initialTab?: SubscriptionScope;
  /** 当前卡剩余轮次（0=用完/无卡；-1=无限） */
  roundsRemaining?: number;
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
    if (!wrap || !text) return;

    const fit = () => {
      // 可用宽度 = 压印名所在网格列（右列）的实际渲染宽度
      const available = wrap.getBoundingClientRect().width;
      if (!available) return;
      // 在参考字号 18px 下测量文字真实渲染宽度
      const ref = 18;
      text.style.fontSize = `${ref}px`;
      const measured = text.getBoundingClientRect().width;
      text.style.fontSize = '';
      if (!measured) return;
      // 数学模型：字号与宽度成线性正比，按比例缩放后留 4% 安全余量
      let size = (ref * available) / measured * 0.96;
      // 两端钳制：不超过参考字号，不低于 7px
      size = Math.min(ref, Math.max(7, size));
      // 对齐到 0.5px，避免亚像素渲染抖动
      size = Math.round(size * 2) / 2;
      setFontSize(size);
    };

    const raf = requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    if (gauge) ro.observe(gauge);
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
  singlePlans,
  creditPacks,
  currentPlanId,
  currentScope = null,
  isPremium,
  from,
  sourceMentorId,
  sourceMentorName,
  initialTab = 'SINGLE',
  roundsRemaining = 0,
  activeSubscription = null,
  freeTrialRemaining = 0,
  freeTrialLimit = 3,
  creditBalance = 0,
  nickname,
}: SubscriptionFlowProps) {
  const router = useRouter();
  const { update } = useSession();

  // 方案标签：单导师付费 / 全导师付费
  const [tab, setTab] = useState<SubscriptionScope>(initialTab);

  // 切换标签：同步 URL（保留 from），刷新/分享后状态不丢
  const switchTab = (next: SubscriptionScope) => {
    if (next === tab) return;
    setTab(next);
    const fromParam = from ? `&from=${encodeURIComponent(from)}` : '';
    router.replace(`/dashboard/subscription?tab=${next === 'ALL' ? 'all' : 'single'}${fromParam}`);
  };

  // 分支弹窗：block=须先用完才能切换；pickMentor=B-1 请先选导师
  const [blockTarget, setBlockTarget] = useState<SubscriptionScope | null>(null);
  const [showPickMentor, setShowPickMentor] = useState(false);

  // 生效卡：压印名的统一宽度标尺（年卡描述文字的 9px 渲染宽），三张卡共用
  const nameGaugeRef = useRef<HTMLDivElement>(null);

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [payState, setPayState] = useState<PayState>('idle');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState('');

  // 生效卡卡套配色：随卡面联动（按 范围+卡种 共 6 套色板）。月光银/云雾青/秋霜紫三色各卡通用，其余按卡面色系搭配
  // 单导师：月卡（杏金）暖金系 / 季卡（鼠尾草绿）绿色系偏红换偏蓝 / 年卡（黑卡）黑色系偏红换偏紫
  // 全导师：月卡（靛蓝）蓝色系 / 季卡（紫晶）紫色系 / 年卡（深牛血）酒红系
  const [sleeveColorIdx, setSleeveColorIdx] = useState(0);
  const sleevePalettes: Record<string, { name: string; stops: string[]; frosted?: boolean }[]> = {
    SINGLE_MONTHLY: [
      { name: '月光银', stops: ['#f5f5f7', '#d8dae0', '#b8bbc4', '#8c9099'] },
      { name: '燕麦白', stops: ['#f2ead8', '#e4d6bc', '#d0bd9c', '#b49e7c'] },
      { name: '云雾青', stops: ['#e0e0ec', '#c2c2dc', '#9a9ac4', '#7676a8'] },
      { name: '玫瑰金', stops: ['#f0d0c8', '#e0a898', '#c88878', '#a86858'] },
      { name: '沙丘驼', stops: ['#e0c8a8', '#c8a878', '#a88858', '#886840'] },
      { name: '秋霜紫', stops: ['#d8d8ec', '#b4b4dc', '#8888c4', '#5e5e9c'] },
      { name: '焦糖棕', stops: ['#d4a06a', '#b8884a', '#98682a', '#785018'] },
      { name: '赤陶红', stops: ['#c08a72', '#a06a52', '#7e4e3a', '#603828'] },
      { name: '古铜金', stops: ['#b8864a', '#986830', '#785020', '#583810'] },
      { name: '摩卡棕', stops: ['#8a6a4a', '#6a4e32', '#4e3822', '#342416'] },
      { name: '琉璃光', stops: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.07)'], frosted: true },
    ],
    SINGLE_QUARTERLY: [
      { name: '月光银', stops: ['#f5f5f7', '#d8dae0', '#b8bbc4', '#8c9099'] },
      { name: '嫩芽白', stops: ['#eef2e4', '#dde6cc', '#c6d4ae', '#a8ba8c'] },
      { name: '云雾青', stops: ['#e0e0ec', '#c2c2dc', '#9a9ac4', '#7676a8'] },
      { name: '冰川蓝', stops: ['#dce8ec', '#bccfd8', '#96b2c0', '#7292a4'] },
      { name: '苔藓绿', stops: ['#b8c8a0', '#9cb082', '#7c9264', '#5e7448'] },
      { name: '秋霜紫', stops: ['#d8d8ec', '#b4b4dc', '#8888c4', '#5e5e9c'] },
      { name: '松针绿', stops: ['#8aa878', '#6c8c5a', '#4e6e40', '#365228'] },
      { name: '远山蓝', stops: ['#7a94a8', '#5c768c', '#405a70', '#284056'] },
      { name: '深苔绿', stops: ['#5a7a58', '#425e42', '#2e4630', '#1c3020'] },
      { name: '夜幕蓝', stops: ['#3a4a58', '#2a3844', '#1c2832', '#101a22'] },
      { name: '琉璃光', stops: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.07)'], frosted: true },
    ],
    SINGLE_YEARLY: [
      { name: '月光银', stops: ['#f5f5f7', '#d8dae0', '#b8bbc4', '#8c9099'] },
      { name: '烟云灰', stops: ['#e2e2e6', '#cbcbd2', '#adaeb8', '#8e92a0'] },
      { name: '云雾青', stops: ['#e0e0ec', '#c2c2dc', '#9a9ac4', '#7676a8'] },
      { name: '丁香紫', stops: ['#ddd8e2', '#c2b8cc', '#a293ad', '#847392'] },
      { name: '青瓦灰', stops: ['#c8c8cc', '#a8a8b0', '#888890', '#686872'] },
      { name: '秋霜紫', stops: ['#d8d8ec', '#b4b4dc', '#8888c4', '#5e5e9c'] },
      { name: '石板灰', stops: ['#8a8a8e', '#6a6a70', '#4e4e54', '#343438'] },
      { name: '暗夜紫', stops: ['#5e6080', '#484a68', '#33344c', '#212234'] },
      { name: '墨玉黑', stops: ['#4a4a50', '#34343a', '#222228', '#121216'] },
      { name: '玄紫黑', stops: ['#2e2c34', '#222026', '#16151a', '#0b0a0e'] },
      { name: '琉璃光', stops: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.07)'], frosted: true },
    ],
    ALL_MONTHLY: [
      { name: '月光银', stops: ['#f5f5f7', '#d8dae0', '#b8bbc4', '#8c9099'] },
      { name: '山岚灰', stops: ['#dde2e8', '#c2cad6', '#a0acba', '#7e8c9e'] },
      { name: '云雾青', stops: ['#e0e0ec', '#c2c2dc', '#9a9ac4', '#7676a8'] },
      { name: '晴雨蓝', stops: ['#d0e0f0', '#aecbe6', '#86aed6', '#6290bc'] },
      { name: '秋霜紫', stops: ['#d8d8ec', '#b4b4dc', '#8888c4', '#5e5e9c'] },
      { name: '孔雀蓝', stops: ['#7aa8b8', '#5c8c9e', '#407084', '#285468'] },
      { name: '深情蓝', stops: ['#5a72a0', '#445986', '#314268', '#212d4c'] },
      { name: '宝石蓝', stops: ['#3a5a9a', '#2c4678', '#1e3258', '#142240'] },
      { name: '深海蓝', stops: ['#2a3c5c', '#1e2c46', '#141e32', '#0c1220'] },
      { name: '藏乌青', stops: ['#2b3547', '#1e2635', '#151c28', '#0d121b'] },
      { name: '琉璃光', stops: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.07)'], frosted: true },
    ],
    ALL_QUARTERLY: [
      { name: '月光银', stops: ['#f5f5f7', '#d8dae0', '#b8bbc4', '#8c9099'] },
      { name: '紫雾白', stops: ['#ece8f0', '#d8d0e2', '#bcb0cc', '#9c8eb0'] },
      { name: '雨霁蓝', stops: ['#d8e4f0', '#b0c4dc', '#88a0c0', '#607898'] },
      { name: '云雾青', stops: ['#e0e0ec', '#c2c2dc', '#9a9ac4', '#7676a8'] },
      { name: '秋霜紫', stops: ['#d8d8ec', '#b4b4dc', '#8888c4', '#5e5e9c'] },
      { name: '紫罗兰', stops: ['#d8c8e4', '#bda8d4', '#9c84c0', '#7c62a4'] },
      { name: '紫水晶', stops: ['#a88cc8', '#8a6cae', '#6c4e90', '#503570'] },
      { name: '葡萄紫', stops: ['#7a5a98', '#5e4478', '#452f5a', '#2e1e40'] },
      { name: '薰衣黛', stops: ['#5c5080', '#463c64', '#322a4a', '#201a32'] },
      { name: '深空紫', stops: ['#443452', '#32263e', '#221a2c', '#140f1c'] },
      { name: '琉璃光', stops: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.07)'], frosted: true },
    ],
    ALL_YEARLY: [
      { name: '月光银', stops: ['#f5f5f7', '#d8dae0', '#b8bbc4', '#8c9099'] },
      { name: '蔷薇白', stops: ['#f2e8e8', '#e4d2d4', '#d0b4b8', '#b49298'] },
      { name: '绛燕紫', stops: ['#8a5a7a', '#6e4460', '#4e2e44', '#2e1a2c'] },
      { name: '玫瑰红', stops: ['#e0b0b0', '#cc8e92', '#b06a70', '#904c54'] },
      { name: '朱砂红', stops: ['#c87868', '#ac5a4e', '#8c423a', '#6c2e2a'] },
      { name: '海棠紫', stops: ['#84506e', '#683856', '#48243c', '#2a1424'] },
      { name: '冬枣红', stops: ['#8a4a44', '#6e3834', '#522824', '#381a18'] },
      { name: '勃艮第', stops: ['#7a2e3e', '#5e2230', '#441824', '#2c0e18'] },
      { name: '酡酒红', stops: ['#5c1e2c', '#44141f', '#2e0d15', '#1c070d'] },
      { name: '胭脂墨', stops: ['#38101c', '#280b14', '#1a070e', '#0e0408'] },
      { name: '琉璃光', stops: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.07)'], frosted: true },
    ],
  };
  const sleevePaletteKey = `${activeSubscription?.scope ?? 'SINGLE'}_${activeSubscription?.plan ?? 'MONTHLY'}`;
  const sleeveColors = sleevePalettes[sleevePaletteKey] ?? sleevePalettes.SINGLE_MONTHLY;
  // 记住每张卡的选择：默认月光银，选过后刷新/重进自动用回所选颜色（localStorage 按卡分别记）
  useEffect(() => {
    const saved = Number(localStorage.getItem(`sleeveColor:${sleevePaletteKey}`));
    setSleeveColorIdx(Number.isInteger(saved) && saved >= 0 && saved < sleeveColors.length ? saved : 0);
  }, [sleevePaletteKey]);
  const pickSleeveColor = (i: number) => {
    setSleeveColorIdx(i);
    localStorage.setItem(`sleeveColor:${sleevePaletteKey}`, String(i));
  };
  const sleeveGradient = (stops: string[]) =>
    `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 35%, ${stops[2]} 65%, ${stops[3]} 100%)`;
  const currentSleeve = sleeveColors[sleeveColorIdx];

  // 弹窗状态
  const [showPayModal, setShowPayModal] = useState(false);
  const [modalPlan, setModalPlan] = useState<{ planId: string; isRenewal: boolean; quantity?: number; mentorId?: string } | null>(null);

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
              const tabParam = `&tab=${tab === 'ALL' ? 'all' : 'single'}`;
              router.push(`/payment/success?orderNo=${data.orderNo}${fromParam}${tabParam}`);
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
    [router, from, tab, update]
  );

  // 用户点击套餐的支付按钮 — 先过分支规则（互斥/选导师），再弹支付方式
  const handlePlanClick = (planId: string, isRenewal = false, quantity = 1) => {
    // 年卡续满冻结：点击不起任何作用（按钮本身也已 disabled，双保险）
    if (isRenewal && planId.endsWith('YEARLY') && yearlyRenewalFull) return;
    // 多榨卡持有上限冻结：余额 + 本次轮次 > 2970 时拦截（双保险）
    const pack = creditPacks.find((p) => p.id === planId);
    if (pack && creditBalance + pack.credits * quantity > CREDIT_PACK_MAX_BALANCE) return;

    const isSingleOrder = planId.startsWith('SINGLE_');
    // -1 表示无限轮次；hasCard 表示当前持有有效订阅卡
    const hasCard = !!activeSubscription;
    const hasRemaining = hasCard && roundsRemaining !== 0;

    // === 分支规则（与下单 API 服务端校验一致，服务端兜底） ===
    if (isSingleOrder) {
      if (hasCard && hasRemaining) {
        if (currentScope === 'ALL') {
          // A-3/B-3：全导师卡有剩余轮次，须用完才能切单导师
          setBlockTarget('SINGLE');
          return;
        }
        if (sourceMentorId && activeSubscription!.mentorId !== sourceMentorId) {
          // 单导师卡有剩余轮次时点另一名导师的「选我」：弹窗阻止
          setBlockTarget('SINGLE');
          return;
        }
        // A-2/B-2：同一张单导师卡，走升级/续费，继续向下
      } else if (!sourceMentorId) {
        // B-1：新用户或轮次已用完，但未选定导师
        setShowPickMentor(true);
        return;
      }
    } else if (planId !== 'CREDIT_10' && creditPacks.every((p) => p.id !== planId)) {
      // 全导师付费
      if (currentScope === 'SINGLE' && hasRemaining) {
        // C-3：单导师卡有剩余轮次，须用完才能切全导师
        setBlockTarget('ALL');
        return;
      }
    }

    // 单导师订单绑定的分身：续费/升级沿用卡内分身；新订阅用来源分身
    const orderMentorId = isSingleOrder
      ? hasCard && hasRemaining && currentScope === 'SINGLE'
        ? activeSubscription!.mentorId ?? undefined
        : sourceMentorId
      : undefined;

    // 套餐选择上报；续期同样记（行为分析可区分）
    const planForEvent = planId === 'CREDIT_PACK' ? 'CREDIT_PACK' : planId;
    const ctaIdMap: Record<string, string> = {
      MONTHLY: 'subscription_monthly_select',
      QUARTERLY: 'subscription_quarterly_select',
      YEARLY: 'subscription_yearly_select',
      SINGLE_MONTHLY: 'subscription_single_monthly_select',
      SINGLE_QUARTERLY: 'subscription_single_quarterly_select',
      SINGLE_YEARLY: 'subscription_single_yearly_select',
      CREDIT_PACK: 'credit_pack_select',
    };
    track('subscribe.click', {
      props: {
        plan: planForEvent as 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CREDIT_PACK',
        ctaId: ctaIdMap[planId] ?? 'subscription_unknown_select',
      },
    });
    setModalPlan({ planId, isRenewal, quantity, mentorId: orderMentorId });
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
          ...(modalPlan.mentorId ? { mentorId: modalPlan.mentorId } : {}),
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

      // 下单环埋点：选定支付方式并成功创建订单，label 带档位用于付费漏斗聚合
      track('cta.click', { props: { ctaId: 'payment_order_create', label: modalPlan.planId } });

      if (data.mock) {
        if (data.payUrl) {
          // 使用相对路径，避免 HTTPS 预览环境下 http:// 被浏览器拦截
          const mockUrl = data.payUrl.replace(/^https?:\/\/[^/]+/, '');
          // 透传 from（来源分身）与 tab（离开时的方案标签），支付成功后按原状态返回
          const stateParams = `${from ? `&from=${encodeURIComponent(from)}` : ''}&tab=${tab === 'ALL' ? 'all' : 'single'}`;
          const mockUrlWithState = mockUrl.includes('?')
            ? `${mockUrl}${stateParams}`
            : `${mockUrl}?from=${encodeURIComponent(from || '')}&tab=${tab === 'ALL' ? 'all' : 'single'}`;
          // 当前窗口跳转到模拟收银台（与真实支付一致，也避免新窗口不继承设备模拟）
          // 收银台支付完成后会自行跳回 /payment/success，当前页即将卸载，不再轮询
          window.location.href = mockUrlWithState;
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

  // 判断某个方案是否被禁用（仅当生效卡与当前标签同方案时按等级约束；
  // 跨方案点击由分支弹窗处理，不做灰置）
  const isPlanDisabled = (basePlan: PlanId): boolean => {
    if (!isPremium || !currentPlanId || currentScope !== tab) return false;
    // 年度会员可以续费年度
    if (currentPlanId === 'YEARLY' && basePlan === 'YEARLY') return false;
    return planRank[basePlan] <= planRank[currentPlanId];
  };

  // 判断某个方案是否是续费方案（同方案年度会员续费年度）
  const isRenewalPlan = (basePlan: PlanId): boolean => {
    return !!isPremium && currentScope === tab && currentPlanId === 'YEARLY' && basePlan === 'YEARLY';
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
  // 当前标签下的卡片配色：单导师沿用金/鼠尾草绿/黑；全导师用新配色（card-all-*）
  const cardClassFor = (scope: SubscriptionScope, basePlan: PlanId) =>
    scope === 'SINGLE'
      ? basePlan === 'MONTHLY'
        ? 'card-gold'
        : basePlan === 'QUARTERLY'
          ? 'card-sage'
          : 'card-black'
      : basePlan === 'MONTHLY'
        ? 'card-all-monthly'
        : basePlan === 'QUARTERLY'
          ? 'card-all-quarterly'
          : 'card-all-yearly';

  // 卡片中央水印字（极淡压印感，位置上移 6px；用 inline rgba 避免 Tailwind 不识别 foil 色导致透明度失效）
  const Watermark = ({ scope, isBlack }: { scope: SubscriptionScope; isBlack: boolean }) => (
    <span
      aria-hidden
      style={{
        transform: 'translateY(-6px)',
        color: isBlack ? 'rgba(245, 215, 133, 0.045)' : 'rgba(255, 255, 255, 0.045)',
      }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center select-none font-serif text-[76px] font-bold leading-none"
    >
      {scope === 'SINGLE' ? '单' : '全'}
    </span>
  );

  // 生效卡专属卡套（背景层）：圆角口袋 + 上下弧线装饰。圆角用 CSS clip-path，与翻盖外角统一
  const ActiveCardSleeve = ({ stops, frosted }: { stops: string[]; frosted?: boolean }) => (
    <>
      {/* 卡套主体：高光色取该卡套最亮色 stops[0]，避免深色卡套上出现假白边；frosted（朦胧透）用半透明白 + 背景模糊做磨砂玻璃 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: sleeveGradient(stops),
          clipPath: 'inset(0 round 22px)',
          boxShadow: frosted
            ? 'inset 2px 2px 0 rgba(255,255,255,0.18), inset -2px -2px 4px rgba(0,0,0,0.10)'
            : `inset 2px 2px 0 ${stops[0]}b3, inset -2px -2px 4px rgba(0,0,0,0.25)`,
          ...(frosted ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
        }}
      />
      {/* 上下弧线装饰 SVG（不参与圆角裁切），描边色取卡套中间偏暗色 */}
      <svg
        aria-hidden
        viewBox="0 0 340 232"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path d="M 10 8 C 70 1, 130 15, 170 10 S 280 -1, 330 10" fill="none" stroke={stops[2]} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
        <path d="M 10 8 C 70 1, 130 15, 170 10 S 280 -1, 330 10 L 330 0 L 10 0 Z" fill={stops[2]} fillOpacity="0.12" />
        <path d="M 10 224 C 70 217, 130 231, 170 226 S 280 215, 330 226" fill="none" stroke={stops[2]} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
        <path d="M 10 224 C 70 217, 130 231, 170 226 S 280 215, 330 226 L 330 232 L 10 232 Z" fill={stops[2]} fillOpacity="0.12" />
      </svg>
    </>
  );

  // 生效卡前景压角层（卡片上方）：左上/右上翻盖。外角用 clip-path A 22 22，与卡套 CSS 圆角完全一致
  // 光影对齐：background-size 设为卡套尺寸，background-position 对齐卡套对应角，使翻盖渐变与卡套共用同一光源坐标
  const ActiveCardClips = ({ stops, frosted }: { stops: string[]; frosted?: boolean }) => {
    const grad = sleeveGradient(stops);
    // 卡套约 335×222，翻盖 38×27，缩放后渐变范围与卡套一致
    const bgSize = '880% 820%';
    const frostBlur = frosted ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {};
    // 透明翻盖投影调轻：磨砂玻璃只投淡淡的软影
    const flapShadow = frosted
      ? 'drop-shadow(1px 1px 0 rgba(0,0,0,0.22)) drop-shadow(3px 4px 3px rgba(0,0,0,0.16))'
      : 'drop-shadow(1px 1px 0 rgba(0,0,0,0.4)) drop-shadow(3px 4px 3px rgba(0,0,0,0.3))';
    return (
    <>
      {/* 左上翻盖：对齐卡套左上角渐变，内弧线收窄匹配新卡套边框 */}
      <div
        className="pointer-events-none absolute left-0 top-0 z-20"
        style={{
          width: 38,
          height: 27,
          background: grad,
          backgroundSize: bgSize,
          backgroundPosition: 'left top',
          backgroundRepeat: 'no-repeat',
          clipPath: 'path("M 22 0 L 38 0 Q 38 15 14 19 Q 2 21 0 27 L 0 22 A 22 22 0 0 1 22 0 Z")',
          filter: flapShadow,
          ...frostBlur,
        }}
      />
      {/* 右上翻盖：镜像 */}
      <div
        className="pointer-events-none absolute right-0 top-0 z-20"
        style={{
          width: 38,
          height: 27,
          background: grad,
          backgroundSize: bgSize,
          backgroundPosition: 'right top',
          backgroundRepeat: 'no-repeat',
          clipPath: 'path("M 16 0 L 0 0 Q 0 15 24 19 Q 36 21 38 27 L 38 22 A 22 22 0 0 0 16 0 Z")',
          filter: flapShadow,
          ...frostBlur,
        }}
      />
    </>
    );
  };

  // 当前标签下展示的套餐列表（统一结构，单导师卡带 basePlan）
  const displayPlans =
    tab === 'SINGLE'
      ? singlePlans.map((p) => ({
          key: p.id,
          basePlan: p.basePlan,
          name: p.name,
          price: p.price,
          period: p.period,
          description: p.description,
          features: p.features,
        }))
      : plans.map((p) => ({
          key: p.id,
          basePlan: p.id,
          name: p.name,
          price: p.price,
          period: p.period,
          description: p.description,
          features: p.features,
        }));

  return (
    <>
      {error && (
        <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-lg animate-fade-in">
          {error}
        </div>
      )}

      {/* 生效卡专属卡套：金色流畅曲线，仅露左右底细线 + 底部 1/3 淡金弧形带，几乎不遮挡卡面 */}
      {activeSubscription && (() => {
        const activePlan =
          activeSubscription.scope === 'SINGLE'
            ? singlePlans.find((p) => p.basePlan === activeSubscription.plan)
            : plans.find((p) => p.id === activeSubscription.plan);
        if (!activePlan) return null;
        const isBlack = activeSubscription.plan === 'YEARLY';
        const cardClass = cardClassFor(activeSubscription.scope, activeSubscription.plan);
        return (
          <div className="relative mx-auto mb-10 w-full max-w-[335px] px-[7px] pt-[8px] pb-[8px]">
            <ActiveCardSleeve stops={currentSleeve.stops} frosted={currentSleeve.frosted} />
            <div className={`relative overflow-hidden rounded-[20px] ${cardClass} aspect-[1.586/1] flex flex-col p-3.5 md:p-4`}
              style={{ boxShadow: '5px 7px 16px -4px rgba(0,0,0,0.30)', outline: 'none' }}>
            <Watermark scope={activeSubscription.scope} isBlack={isBlack} />

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
              <p className={`font-mono text-[10px] font-medium uppercase tracking-masthead ${isBlack ? 'text-foil' : 'text-foil-light'}`}>
                {activePlan.id}
              </p>
              <div className="text-right">
                <p className={`font-serif text-[18px] font-bold ${isBlack ? 'text-foil' : 'text-foil-light'} leading-none`}>
                  {activePlan.name}
                </p>
                {activePlan.description && (
                  <p className={`text-[9px] mt-0.5 ${isBlack ? 'text-foil/60' : 'text-white/60'}`}>
                    {activePlan.description}
                  </p>
                )}
                {/* 统一宽度标尺：固定 9px 单行宽，三张卡右列同宽，压印名以此尺测宽缩放字号 */}
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
                {/* 称呼下方一行：本卡可对话范围（下移 16px 避免与压印名重合） */}
                <p className={`mt-5 text-right text-[10px] leading-tight ${isBlack ? 'text-foil/70' : 'text-white/70'}`}>
                  {activeSubscription.scope === 'SINGLE' && activeSubscription.boundMentorName
                    ? `可与导师 ${activeSubscription.boundMentorName} 分身对话`
                    : '可与全体导师分身对话'}
                </p>
              </div>
            </div>

            <div className={`mt-auto pt-1 text-right text-[10px] ${isBlack ? 'text-foil/75' : 'text-white/75'}`}>
              {new Date(activeSubscription.endDate).toLocaleDateString('zh-CN')} 到期 · 剩余 {activeSubscription.daysRemaining} 天
              {roundsRemaining >= 0 && ` · 剩余 ${roundsRemaining} 轮次`}
            </div>
            </div>
            {/* 前景压角层（卡片上方，盖住卡角） */}
            <ActiveCardClips stops={currentSleeve.stops} frosted={currentSleeve.frosted} />
          </div>
        );
      })()}

      {/* 卡套配色选择：六个色彩点，位于卡套下方、分割线上方 */}
      {activeSubscription && (
        <div className="relative z-20 mx-auto mb-5 flex w-full max-w-[335px] flex-wrap items-center justify-center gap-3.5">
          {sleeveColors.map((c, i) => (
            <button
              key={c.name}
              onClick={() => pickSleeveColor(i)}
              className={`group relative h-3.5 w-3.5 rounded-full transition-all duration-150 ${
                sleeveColorIdx === i
                  ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#1E2E3F] scale-125'
                  : 'opacity-80 hover:opacity-100 hover:scale-110'
              }`}
              style={{ background: sleeveGradient(c.stops) }}
            >
              {/* 悬停显示色名 */}
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {c.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 生效卡与下方方案卡之间：多榨卡同款分割线 + 按卡种/剩余轮次的升级提示 */}
      {activeSubscription && (() => {
        const scopeText = activeSubscription.scope === 'SINGLE' ? '单导师' : '全导师';
        const otherText = activeSubscription.scope === 'SINGLE' ? '全导师' : '单导师';
        const used = roundsRemaining === 0; // -1=无限，按 >0 处理
        let hint: string;
        if (activeSubscription.plan === 'MONTHLY') {
          hint = used
            ? `可进一步升级为${scopeText}季度/年度会员，或切换到${otherText}付费制`
            : `可进一步升级为${scopeText}季度/年度会员`;
        } else if (activeSubscription.plan === 'QUARTERLY') {
          hint = used
            ? `可进一步升级为${scopeText}年度会员，或切换到${otherText}付费制`
            : `可进一步升级为${scopeText}年度会员`;
        } else {
          hint = used
            ? activeSubscription.scope === 'SINGLE'
              ? `可进一步续费到下一年，或切换到${otherText}付费制`
              : `可进一步续费下一年，或切换到${otherText}付费制`
            : '可进一步续费到下一年';
        }
        return (
          <div className="flex items-center gap-3 mb-7 w-full max-w-[335px] mx-auto">
            <span className="h-px flex-1 bg-white/15" />
            <span className="shrink-0 rounded-full bg-[#1E2E3F]/65 px-3 py-0.5 text-xs text-white/75 backdrop-blur-[2px]">{hint}</span>
            <span className="h-px flex-1 bg-white/15" />
          </div>
        );
      })()}

      {/* 方案标签：文件夹式分类标签（z-10 防金币遮挡；单=金、全=蓝，各自呼应卡面） */}
      <div className="relative z-10 mx-auto mb-6 flex w-full max-w-[335px] items-end gap-1.5 px-1">
        {(['SINGLE', 'ALL'] as const).map((s) => {
          const active = tab === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => switchTab(s)}
              className={`flex-1 text-sm font-medium transition-all ${
                active
                  ? s === 'SINGLE'
                    ? 'rounded-t-xl bg-[#F5D785] px-4 pb-2.5 pt-3 text-[#5B4913] shadow-[0_-2px_10px_rgba(0,0,0,0.25)]'
                    : 'rounded-t-xl bg-[#5B7DB8] px-4 pb-2.5 pt-3 text-white shadow-[0_-2px_10px_rgba(0,0,0,0.25)]'
                  : 'rounded-t-lg bg-white/10 px-4 py-2 text-white/65 ring-1 ring-white/10 hover:bg-white/20 hover:text-white'
              }`}
            >
              {s === 'SINGLE' ? '单导师付费' : '全导师付费'}
            </button>
          );
        })}
      </div>

      {/* 单导师标签下：当前选中分身提示（无选中则引导去点「选我」） */}
      {tab === 'SINGLE' && (sourceMentorName || !activeSubscription) && (
        <p className="mb-5 -mt-3 text-center text-xs text-white/60">
          {sourceMentorName ? `当前选中：${sourceMentorName} 分身` : '先在导师主页点「选我」，再回来付费'}
        </p>
      )}

      {/* 非会员：免费试用剩余次数 — 低调一行小字（字号随屏宽自适应，单行不换行） */}
      {!isPremium && (
        <p className="mb-4 whitespace-nowrap text-center text-muted text-[clamp(9px,3.2vw,12px)]">
          当前为非会员用户 · 剩余免费试用导师分身次数 {freeTrialRemaining} / {freeTrialLimit} 次
        </p>
      )}

      <div className="space-y-5">
        {displayPlans
          // 当前方案卡已置顶为"生效中"；同方案年卡续费入口保留
          .filter((plan) => !(currentScope === tab && plan.basePlan === currentPlanId) || isRenewalPlan(plan.basePlan))
          .map((plan) => {
        const disabled = isPlanDisabled(plan.basePlan);
        const renewal = isRenewalPlan(plan.basePlan);

        const cardClass = cardClassFor(tab, plan.basePlan);
        const isBlack = plan.basePlan === 'YEARLY';

        return (
          <div
            key={plan.key}
            className={`relative w-full max-w-[335px] mx-auto rounded-[20px] ${cardClass} aspect-[1.586/1] flex flex-col p-3.5 md:p-4 ${disabled ? 'opacity-50 grayscale' : ''}`}
          >
            <Watermark scope={tab} isBlack={isBlack} />
            {/* 角标区：年卡续费入口 — 正常=绿色"续费"；剩余 >1460 天=橙色"续满"冻结 */}
            {renewal && (
              <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 tag text-xs px-3 py-0.5 text-white whitespace-nowrap ${yearlyRenewalFull ? 'bg-brand-500' : 'bg-accent'}`}>
                {yearlyRenewalFull ? '续满' : '续费'}
              </span>
            )}

            {/* 顶行：masthead + 方案名 */}
            <div className="flex items-start justify-between">
              <p className={`font-mono text-[10px] font-medium uppercase tracking-masthead ${isBlack ? 'text-foil' : 'text-foil-light'}`}>
                {plan.key}
              </p>
              <div className="text-right">
                <p className={`font-serif text-[18px] font-bold ${isBlack ? 'text-foil' : 'text-foil-light'} leading-none`}>
                  {plan.name.replace('会员', '')}
                </p>
                {plan.description && (
                  <p className={`text-[9px] mt-0.5 ${isBlack ? 'text-foil/60' : 'text-white/60'}`}>{plan.description}</p>
                )}
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
                  onClick={() => handlePlanClick(plan.key, renewal)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-masthead transition-all active:scale-95 ${
                    isBlack
                      ? tab === 'SINGLE'
                        ? 'bg-foil text-black hover:bg-white'
                        : 'bg-[#2a0812] text-[#8a3040] hover:bg-[#FFFDF2]'
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

      {/* 互斥弹窗：当前卡还有剩余轮次，须用完才能切换到目标方案 */}
      {blockTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
          onClick={() => setBlockTarget(null)}
        >
          <div
            className="relative overflow-hidden bg-bg cream-foil rounded-2xl px-6 pt-7 pb-6 mx-4 max-w-[320px] w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <GoldFlakes count={1} stars={1} />
            <div className="relative z-10">
              <p className="text-sm leading-relaxed text-ink">
                亲爱的{nickname || '朋友'}：你目前还有 {roundsRemaining} 对话轮次没用完，为保证你的权益，必须用完才能切换为{blockTarget === 'SINGLE' ? '单导师' : '全导师'}订阅，感谢你的支持。
              </p>
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                className="btn-primary mt-5 w-full text-sm"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B-1 弹窗：未选定导师，先去导师列表挑一位 */}
      {showPickMentor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
          onClick={() => setShowPickMentor(false)}
        >
          <div
            className="relative overflow-hidden bg-bg cream-foil rounded-2xl px-6 pt-7 pb-6 mx-4 max-w-[320px] w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <GoldFlakes count={1} stars={1} />
            <div className="relative z-10">
              <p className="text-sm leading-relaxed text-ink">
                亲爱的{nickname || '朋友'}，请先选中想要对话的导师，再来这里付费，谢谢你的支持。
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPickMentor(false)}
                  className="flex-1 rounded-lg border border-ink/20 py-2 text-sm text-muted transition-colors hover:text-ink"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/mentors')}
                  className="btn-primary flex-1 text-sm"
                >
                  好的
                </button>
              </div>
            </div>
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
                data-track="pay_method_wechat"
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
                data-track="pay_method_alipay"
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
