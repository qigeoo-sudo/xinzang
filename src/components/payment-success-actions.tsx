'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export function PaymentSuccessActions({
  returnTo = '/dashboard/subscription',
  returnLabel = '返回订阅页',
}: {
  /** 付费完成后的去向：来自导师页回聊天断开位置，否则留订阅页看生效卡 */
  returnTo?: string;
  returnLabel?: string;
}) {
  const { update } = useSession();
  // 倒计时自动返回：支付成功信息展示几秒后无须用户操作即回到来源页
  const [countdown, setCountdown] = useState(3);

  // 支付完成后从收银台回到本页（当前窗口跳转，原订阅页已卸载），
  // 在这里强制刷新 JWT 会话，让 isPremium 等状态立刻从数据库更新
  useEffect(() => {
    // 注意：必须传入参数（即使是空对象）。
    // next-auth v5 的 update() 不带参数时只会 GET 旧会话；
    // 传参才会带 csrfToken 发 POST，触发服务端 jwt 回调 trigger==='update'
    // 从数据库重新读取 isPremium 等字段。
    update({})
      .catch(() => {
        // 刷新失败不阻塞页面，后续请求/重新登录会拿到新状态
      });
  }, [update]);

  // 倒计时归零自动跳回；倒计时期间用户也可点按钮立即返回
  useEffect(() => {
    if (countdown <= 0) {
      window.location.href = returnTo;
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, returnTo]);

  // 来自导师页 → 回聊天断开位置；否则回订阅页，让用户立刻看到订阅生效状态
  const handleReturn = () => {
    window.location.href = returnTo;
  };

  return (
    <div>
      <button
        onClick={handleReturn}
        className="btn-primary block text-center w-full"
      >
        {countdown > 0 ? `${returnLabel}（${countdown}）` : returnLabel}
      </button>
    </div>
  );
}
