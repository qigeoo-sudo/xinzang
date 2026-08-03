import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { ClientLayout } from "@/components/layout/client-layout";

export const metadata: Metadata = {
  title: "AI Career Companion · 你的AI职业伙伴",
  description: "让每个年轻人都有AI职业伙伴",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <LanguageProvider>
          <ClientLayout>{children}</ClientLayout>
        </LanguageProvider>
      </body>
    </html>
  );
}
