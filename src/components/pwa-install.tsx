'use client';

import { useEffect, useState } from 'react';

/**
 * PWA 安装入口（模仿 squoosh.app 的 Install 流程）
 *
 * - 安卓 Chrome / 桌面 Chromium：捕获 beforeinstallprompt，点击直接调起系统安装弹窗
 * - iOS Safari：系统不提供安装弹窗（所有 PWA 都一样），点击弹图文指引：
 *   底部分享按钮 → 添加到主屏幕
 * - iOS 微信内置浏览器：无分享添加入口，先引导用 Safari 打开
 * - 已以 standalone 模式运行（已安装）：不渲染
 *
 * 可安装性前提（项目已具备）：manifest.json + 含 fetch handler 的 sw.js + HTTPS
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallEnv = 'unknown' | 'prompt' | 'ios-browser' | 'ios-wechat';

const copy = {
  zh: {
    install: '安装到手机',
    title: '安装到手机主屏幕',
    close: '知道了',
    wechat:
      '微信内无法直接安装：请点右上角「···」，选择「在 Safari 中打开」，再按下面步骤操作。',
    steps: [
      '点击浏览器底部工具栏的「分享」按钮（方框带向上箭头的图标）',
      '在弹出的菜单中选择「添加到主屏幕」（加号图标）',
      '点右上角「添加」，桌面就会出现 App 图标，以后可直接打开',
    ],
  },
  en: {
    install: 'Install App',
    title: 'Add to Home Screen',
    close: 'Got it',
    wechat:
      'Installation is not available inside WeChat. Tap「···」in the top-right corner, choose「Open in Safari」, then follow the steps below.',
    steps: [
      'Tap the「Share」button in the bottom toolbar (the square with an upward arrow)',
      'Choose「Add to Home Screen」(the plus icon) in the menu',
      'Tap「Add」in the top-right corner — the app icon will appear on your home screen',
    ],
  },
} as const;

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PwaInstall({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const [installEnv, setInstallEnv] = useState<InstallEnv>('unknown');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  // 挂载后再输出环境相关 UI，避免 SSR 水合不一致
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isStandaloneMode()) return;

    const ua = window.navigator.userAgent || '';
    // iPadOS 13+ 会把自己伪装成 Mac，用 maxTouchPoints 兜底识别
    const isIOS =
      /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
    const isWeChat = /MicroMessenger/i.test(ua);

    if (isIOS) {
      setInstallEnv(isWeChat ? 'ios-wechat' : 'ios-browser');
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setInstallEnv('prompt');
    };
    const onInstalled = () => {
      setInstallEnv('unknown');
      setGuideOpen(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installEnv === 'prompt' && deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallEnv('unknown');
      }
      setDeferred(null);
      return;
    }
    // iOS 各浏览器都只能展示手动添加指引
    setGuideOpen(true);
  };

  if (!mounted || installEnv === 'unknown') return null;

  const t = copy[lang];
  const isWeChat = installEnv === 'ios-wechat';

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 active:scale-[.98]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v12" />
          <path d="M7 8l5-5 5 5" />
          <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
        </svg>
        {t.install}
      </button>

      {guideOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setGuideOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t.title}
        >
          <div
            className="w-full max-w-md animate-slide-up rounded-t-3xl bg-white p-5 pb-8 shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">{t.title}</h3>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-beige text-muted hover:text-ink"
                aria-label={t.close}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {isWeChat && (
              <div className="mb-4 rounded-xl bg-accent/10 px-4 py-3 text-xs leading-5 text-accent">
                {t.wechat}
              </div>
            )}

            <ol className="space-y-3.5">
              <Step index={1} icon="share">
                {t.steps[0]}
              </Step>
              <Step index={2} icon="plus">
                {t.steps[1]}
              </Step>
              <Step index={3} icon="check">
                {t.steps[2]}
              </Step>
            </ol>

            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="mt-6 w-full rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 active:scale-[.98]"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Step({
  index,
  icon,
  children,
}: {
  index: number;
  icon: 'share' | 'plus' | 'check';
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-700">
        {icon === 'share' && (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="M8 7l4-4 4 4" />
            <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
          </svg>
        )}
        {icon === 'plus' && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
        {icon === 'check' && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <p className="pt-0.5 text-sm leading-6 text-ink/85">
        <span className="mr-1 text-xs font-bold text-muted">{index}.</span>
        {children}
      </p>
    </li>
  );
}
