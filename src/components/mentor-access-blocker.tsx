'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 访问拦截提示框（可复用）
 * 当用户未完成 AI 职导访谈时，弹出此提示框
 * 显示 2.7 秒后自动跳转回 AI 职导聊天页面
 *
 * @param message 两行提示文字（用 \n 分隔）
 */
export function AccessBlocker({
  message = '访谈交流完成后才\n能和导师分身聊天',
}: {
  message?: string;
}) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 延迟一帧显示，触发淡入动画
    requestAnimationFrame(() => setVisible(true));

    // 倒计时：2.7 秒内 3 → 2 → 1（每 0.9 秒递减）
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(1, prev - 1));
    }, 900);

    // 2.7 秒后跳转
    const timer = setTimeout(() => {
      router.push('/chat?need=questionnaire');
    }, 2700);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <>
      {/* 模态遮罩 */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className={`bg-white rounded-[20px] px-8 pt-9 pb-7 mx-4 max-w-[320px] w-full text-center shadow-2xl transition-all duration-300 ${
            visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'
          }`}
        >
          {/* 提示文字 — 14px，不加粗 */}
          <p
            className="text-[14px] font-normal text-slate-800 mb-6 leading-[1.6]"
            style={{ whiteSpace: 'pre-line' }}
          >
            {message}
          </p>

          {/* 倒计时进度条 — 淡橄榄绿，宽度 70%，2.7 秒动画 */}
          <div className="w-[70%] mx-auto h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                backgroundColor: '#a8b820',
                animation: 'blocker-shrink 2.7s linear forwards',
              }}
            />
          </div>

          {/* 倒计时数字 */}
          <p className="mt-3 text-[13px] text-slate-400">
            <span className="font-semibold" style={{ color: '#a8b820' }}>{countdown}</span>{' '}
            秒后自动返回 AI 职导
          </p>
        </div>
      </div>

      {/* 内联动画关键帧 */}
      <style>{`
        @keyframes blocker-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </>
  );
}

/**
 * 兼容导出 — 导师详情页使用的旧名称
 */
export function MentorAccessBlocker() {
  return <AccessBlocker message={'访谈交流完成后才\n能和导师分身聊天'} />;
}
