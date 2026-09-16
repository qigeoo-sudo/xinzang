import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import { ServiceWorkerRegister } from '@/components/sw-register';
// 杂志风标题字体（思源宋体）与刊头小字（DM Mono），fontsource 自托管，构建不依赖外网
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-serif-sc/700.css';
import '@fontsource/noto-serif-sc/900.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Career Companion - 你的 AI 职业导师',
  description:
    '通过 AI 导师分身技术，为大学生和职场新人提供真实的职业指导。温暖、有同理心，不说空话套话。',
  applicationName: 'AI Career Companion',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/favicon-32x32.png',
    apple: '/icons/apple-touch-icon-180x180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AI 职业导师',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // 与页头渐变顶端同色，状态栏 → 导航 → 页头颜色连成一条
  themeColor: '#FDF5EC',
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
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
