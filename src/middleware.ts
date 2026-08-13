/**
 * Next.js 中间件 — 修复安全审计 A01-1.3
 * 路由级访问控制
 *
 * 使用 Auth.js v5 的 authorized 回调进行路由保护:
 * - 未登录用户访问受保护路由 → 重定向到 /login
 * - 已登录用户访问 /login 或 /register → 重定向到 /
 * - 公开路由无需登录即可访问
 *
 * 安全路由保护规则:
 * - /dashboard, /profile, /chat, /payment, /settings → 需要登录
 * - /mentors/[id] (付费导师) → 需要登录 + 会员验证 (在页面层处理)
 * - /api/user/*, /api/chat/sessions, /api/orders/* → 需要登录
 */
import { auth } from '@/auth';

export default auth;

export const config = {
  /**
   * 匹配器 — 排除静态资源和 Next.js 内部路由
   * 仅对页面和 API 路由运行中间件
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-*.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
};
