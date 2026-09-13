'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export function PaymentSuccessActions({ from }: { from?: string }) {
  const router = useRouter();
  const { update } = useSession();

  // 支付完成后从收银台回到本页（当前窗口跳转，原订阅页已卸载），
  // 在这里强制刷新 JWT 会话，让 isPremium 等状态立刻从数据库更新
  useEffect(() => {
    let alive = true;
    // 注意：必须传入参数（即使是空对象）。
    // next-auth v5 的 update() 不带参数时只会 GET 旧会话；
    // 传参才会带 csrfToken 发 POST，触发服务端 jwt 回调 trigger==='update'
    // 从数据库重新读取 isPremium 等字段。
    update({})
      .then(() => {
        if (alive) router.refresh();
      })
      .catch(() => {
        // 刷新失败不阻塞页面，后续请求/重新登录会拿到新状态
      });
    return () => {
      alive = false;
    };
  }, [update, router]);

  const handleReturn = () => {
    if (from) {
      window.location.href = from;
    } else {
      router.back();
    }
  };

  return (
    <div>
      <button
        onClick={handleReturn}
        className="btn-primary block text-center w-full"
      >
        返回
      </button>
    </div>
  );
}
