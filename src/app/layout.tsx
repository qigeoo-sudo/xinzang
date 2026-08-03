import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
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
          <AuthProvider>
            <ClientLayout>{children}</ClientLayout>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
