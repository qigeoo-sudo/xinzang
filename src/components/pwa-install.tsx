'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* 步骤文案里的 inline 图标，跟随文字颜色（currentColor） */
function ShareInline() {
  return (
    <svg className="ml-0.5 inline-block align-middle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M9 12H5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V12h-4" />
    </svg>
  );
}
function MoreInline() {
  return (
    <svg className="ml-0.5 inline-block align-middle" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}
function PlusSquareInline() {
  return (
    <svg className="ml-0.5 inline-block align-middle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function ChevronDownInline() {
  return (
    <svg className="ml-0.5 inline-block align-middle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

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
    installMobile: '安装到手机',
    installDesktop: '安装到桌面',
    titleMobile: '安装到手机主屏幕',
    titleDesktop: '安装到桌面',
    installedTitle: '正在安装……',
    installedDescDesktop: '耐心等一会儿，就会看到桌面上安装好的图标。',
    installedDescMobile: '耐心等一会儿，就会看到主屏幕上安装好的图标。',
    gotIt: '知道了',
    close: '知道了',
    desktopHint:
      '推荐使用 Chrome 或 Edge 浏览器点击此按钮，可直接安装为桌面应用。Safari 用户可通过菜单栏「文件」→「添加到程序坞」完成安装。',
    wechat:
      '微信内无法直接安装：请点右上角「···」，选择「在 Safari 中打开」，再按下面步骤操作。',
    steps: [
      <>推荐用 Safari 打开榨职机首页，底部或顶部的标签栏里找到「共享」按钮<ShareInline />点击，如没找到，点击表示更多的图标<MoreInline />，再进共享</>,
      <>在共享面板中向下滑动选择「添加到主屏幕」<PlusSquareInline />，或看到右侧有图标<ChevronDownInline />，点开再找</>,
      <>在新页面里，点右上角「添加」，主屏就会出现图标，以后直接从图标启动</>,
    ] as ReactNode[],
  },
  en: {
    installMobile: 'Install App',
    installDesktop: 'Install to Desktop',
    titleMobile: 'Add to Home Screen',
    titleDesktop: 'Install to Desktop',
    installedTitle: 'Installing…',
    installedDescDesktop: 'Please wait a moment — the icon will appear on your desktop shortly.',
    installedDescMobile: 'Please wait a moment — the icon will appear on your home screen shortly.',
    gotIt: 'Got it',
    close: 'Got it',
    desktopHint:
      'We recommend using Chrome or Edge to install this app directly to your desktop. Safari users can install via the menu bar: File → Add to Dock.',
    wechat:
      'Installation is not available inside WeChat. Tap「···」in the top-right corner, choose「Open in Safari」, then follow the steps below.',
    steps: [
      <>Open the Squeezer homepage in Safari. Find the「Share」button in the bottom or top tab bar<ShareInline /> and tap it. If you can't find it, tap the more icon<MoreInline /> to access Share.</>,
      <>In the Share sheet, scroll down and choose「Add to Home Screen」<PlusSquareInline />. Or look for the icon on the right<ChevronDownInline />, tap it to find it.</>,
      <>On the new page, tap「Add」in the top-right corner. The icon will appear on your home screen — launch it directly from there.</>,
    ] as ReactNode[],
  },
};

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
  // 是否已安装（standalone 运行 或 已确认安装完成）：隐藏入口
  const [installed, setInstalled] = useState(false);
  // 本次会话中刚完成安装：展示成功提示（桌面端 Chrome 不会自动关标签页，需明确告知用户）
  const [justInstalled, setJustInstalled] = useState(false);
  // iOS：用户点了安装按钮后等待页面切走再回来，据此推断完成添加
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  // 是否移动端：影响按钮文案（桌面「安装到桌面」/ 手机「安装到手机」）
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isStandaloneMode()) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent || '';
    // iPadOS 13+ 会把自己伪装成 Mac，用 maxTouchPoints 兜底识别
    const isIOS =
      /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
    const isWeChat = /MicroMessenger/i.test(ua);
    // 移动端：iOS 或 Android/其他移动设备
    setIsMobile(isIOS || /Mobi|Android/i.test(ua));

    if (isIOS) {
      setInstallEnv(isWeChat ? 'ios-wechat' : 'ios-browser');
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setInstallEnv('prompt');
    };
    const onInstalled = () => {
      setJustInstalled(true);
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

  // iOS Safari 不触发 appinstalled 事件；用户点安装按钮后去操作「分享→添加到主屏幕」，
  // 页面会切到后台再回来。据此推断已添加，隐藏按钮，避免再次点击弹出指引。
  useEffect(() => {
    if (!awaitingReturn) return;
    const finish = () => {
      setJustInstalled(true);
      setGuideOpen(false);
      setAwaitingReturn(false);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') finish();
    };
    const onPageShow = () => finish();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [awaitingReturn]);

  const handleInstall = async () => {
    if (installEnv === 'prompt' && deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setJustInstalled(true);
        setInstallEnv('unknown');
      }
      setDeferred(null);
      return;
    }
    // iOS 各浏览器都只能展示手动添加指引
    setGuideOpen(true);
    // iOS：开始等待页面切走再回来，据此推断完成添加并隐藏按钮
    if (installEnv === 'ios-browser' || installEnv === 'ios-wechat') {
      setAwaitingReturn(true);
    }
  };

  if (!mounted) return null;

  const t = copy[lang];
  const isWeChat = installEnv === 'ios-wechat';
  // 桌面端：非移动端（含桌面 Chrome/Edge 的 prompt 环境、桌面 Safari/Firefox 的 unknown 环境）
  const isDesktop = !isMobile;

  // 刚完成安装：展示成功提示（桌面端 Chrome 不会自动关标签页，需告知用户从桌面图标启动）
  if (justInstalled) {
    return (
      <div
        className="flex w-full flex-col gap-3 rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-white"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0 text-emerald-300"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">{t.installedTitle}</p>
            <p className="mt-1 text-xs leading-5 text-white/70">
              {isDesktop ? t.installedDescDesktop : t.installedDescMobile}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setInstalled(true); setJustInstalled(false); }}
          className="self-end rounded-lg bg-white/15 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/25"
          aria-label={t.gotIt}
        >
          {t.gotIt}
        </button>
      </div>
    );
  }

  if (installed) return null;

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
          {/* 充电宝外壳 */}
          <rect x="6" y="2" width="12" height="20" rx="2" />
          {/* 顶部 USB 接口 */}
          <path d="M10 2V0.5h4V2" />
          {/* 中间闪电（充电指示） */}
          <path d="M14 8 L10 13 L12 13 L11 16 L15 11 L12 11 Z" fill="currentColor" stroke="none" />
        </svg>
        {isMobile ? t.installMobile : t.installDesktop}
      </button>

      {mounted && guideOpen && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => { setGuideOpen(false); setAwaitingReturn(false); }}
          role="dialog"
          aria-modal="true"
          aria-label={isMobile ? t.titleMobile : t.titleDesktop}
        >
          <div
            className="w-full max-w-md animate-slide-up overflow-hidden rounded-t-3xl bg-[#FCF8EE] p-5 pb-8 shadow-xl sm:rounded-3xl"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">{isMobile ? t.titleMobile : t.titleDesktop}</h3>
              <button
                type="button"
                onClick={() => { setGuideOpen(false); setAwaitingReturn(false); }}
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

            {isDesktop && (
              <div className="mb-4 rounded-xl bg-brand-500/10 px-4 py-3 text-xs leading-5 text-brand-700">
                {t.desktopHint}
              </div>
            )}
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
              <Step index={3} icon="add-text">
                {t.steps[2]}
              </Step>
            </ol>

            <button
              type="button"
              onClick={() => { setGuideOpen(false); setAwaitingReturn(false); }}
              className="mt-6 w-full rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 active:scale-[.98]"
            >
              {t.close}
            </button>
          </div>
        </div>,
        document.body
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
  icon: 'share' | 'plus' | 'add-text';
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
            <path d="M9 12H5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V12h-4" />
          </svg>
        )}
        {icon === 'plus' && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        )}
        {icon === 'add-text' && (
          <span className="text-[10px] font-bold">添加</span>
        )}
      </span>
      <p className="pt-0.5 text-sm leading-6 text-ink/85">
        <span className="mr-1 text-xs font-bold text-muted">{index}.</span>
        {children}
      </p>
    </li>
  );
}
