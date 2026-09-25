import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { PendingAssessmentSync } from '@/components/pending-assessment-sync';
import { JuiceOverlay } from '@/components/juice-splash';
import { AttributionCapture } from '@/components/attribution-capture';
// 杂志风标题字体（思源宋体）与刊头小字（DM Mono），fontsource 自托管，构建不依赖外网
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-serif-sc/700.css';
import '@fontsource/noto-serif-sc/900.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
// 签名狂草（柳建毛草），自托管避免国内拉不到 Google Fonts 回退成行书
import '@fontsource/liu-jian-mao-cao/400.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Career Companion - 你的 AI 职业导师',
  description:
    '通过 AI 导师分身技术，为大学生和职场新人提供真实的职业指导。温暖、有同理心，不说空话套话。',
  applicationName: 'AI Career Companion',
  // 带版本号：手机检测到 manifest 地址变化后重新拉取并更新已安装应用的配色
  manifest: '/manifest.json?v=20260925b',
  icons: {
    icon: '/icons/favicon-32x32.png',
    apple: '/icons/apple-touch-icon-180x180.png',
  },
  appleWebApp: {
    capable: true,
    // 透明状态栏：让导航橙色行延伸到状态栏下方（iOS standalone）
    statusBarStyle: 'black-translucent',
    title: 'AI 职业导师',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // 与导航按钮行橙色渐变顶端同色，状态栏 → 导航 → 页头颜色连成一条
  // 必须保留无 media 的单字符串：部分安卓 Chrome 对仅含 media 的多条
  // theme-color 匹配失败，状态栏会回退系统白（2026-09-25 实测）
  themeColor: '#F8B357',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen safe-bottom overflow-x-hidden">
        <Providers>
          {children}
          {/* 登录成功后自动把访客暂存的测评结果落库（无 UI，需在 SessionProvider 内） */}
          <PendingAssessmentSync />
        </Providers>
        {/* 渠道归因：带 ch/utm 参数落地时记录首次触点（无 UI） */}
        <AttributionCapture />
        {/* 全局果汁飞溅层：只挂载一次，页面切换不卸载，动画可跨页面播完 */}
        <JuiceOverlay />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
