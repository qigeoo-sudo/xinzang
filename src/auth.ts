/**
 * Auth.js v5 (NextAuth v5) 认证配置
 * 修复安全审计 A04-4.1, A07-7.1: 实现完整的后端认证服务
 *
 * 特性:
 * - JWT 会话策略 (Credentials Provider 要求)
 * - bcrypt 密码哈希验证
 * - 自定义 JWT/Session 回调，携带用户角色和会员状态
 * - Prisma Adapter 支持 (为未来 OAuth 登录预留)
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { resetTestAccountsIfNeeded, isTestAccount } from '@/lib/test-accounts';
import { z } from 'zod';

// 登录凭据校验 Schema — 支持手机或邮箱登录
const credentialsSchema = z.object({
  email: z.string().min(1, '请输入手机号或邮箱'),
  password: z.string().min(1, '密码不能为空'),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Prisma Adapter — 为 OAuth Provider 预留，Credentials 使用 JWT
  adapter: PrismaAdapter(prisma),

  // JWT 策略 — Credentials Provider 必须使用 JWT
  session: {
    strategy: 'jwt',
    // 会话有效期 7 天 (修复安全审计 A07: 会话过期机制)
    maxAge: 7 * 24 * 60 * 60,
  },

  // 自定义页面路由
  pages: {
    signIn: '/login',
    error: '/login',
  },

  providers: [
    Credentials({
      name: '邮箱密码登录',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      authorize: async (credentials) => {
        try {
          // 输入校验 — 防止注入
          const parsed = credentialsSchema.safeParse(credentials);
          if (!parsed.success) {
            return null;
          }

          const { email: identifier, password } = parsed.data;

          // 判断是手机号还是邮箱，查询用户
          const isPhone = /^1[3-9]\d{9}$/.test(identifier);
          let user;

          if (isPhone) {
            user = await prisma.user.findUnique({
              where: { phone: identifier },
            });
          } else {
            user = await prisma.user.findUnique({
              where: { email: identifier.toLowerCase() },
            });
          }

          // 用户不存在或未设置密码
          if (!user || !user.passwordHash) {
            return null;
          }

          // 验证密码
          const isValid = await verifyPassword(password, user.passwordHash);
          if (!isValid) {
            return null;
          }

          // 测试账号: 登录时触发自动恢复检查（5分钟后恢复初始状态）
          const testIdentifier = user.phone || user.email || '';
          if (isTestAccount(testIdentifier)) {
            await resetTestAccountsIfNeeded(user.id);
            // 重新查询用户，获取恢复后的最新状态
            const refreshedUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { isPremium: true, freeTrialUsed: true },
            });
            if (refreshedUser) {
              user.isPremium = refreshedUser.isPremium;
              user.freeTrialUsed = refreshedUser.freeTrialUsed;
            }
          }

          // 更新最后登录时间
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          // 返回用户信息 (写入 JWT)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isPremium: user.isPremium,
            freeTrialUsed: user.freeTrialUsed,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    // JWT 回调 — 将用户信息写入 token
    jwt: async ({ token, user, trigger }) => {
      // 初次登录时，user 对象来自 authorize 返回值
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.isPremium = (user as any).isPremium;
        token.freeTrialUsed = (user as any).freeTrialUsed;
      }

      // 会话更新时 (如支付成功后 update session)，从数据库重新获取最新状态
      // 注意: 仅在 trigger === 'update' 时查询数据库，
      // 避免在 Edge Runtime (middleware) 中调用 Prisma 导致崩溃
      if (trigger === 'update' && token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              role: true,
              isPremium: true,
              freeTrialUsed: true,
              name: true,
            },
          });
          if (dbUser) {
            token.role = dbUser.role;
            token.isPremium = dbUser.isPremium;
            token.freeTrialUsed = dbUser.freeTrialUsed;
            token.name = dbUser.name;
          }
        } catch {
          // Edge Runtime 中 Prisma 不可用，保留 token 中的现有值
        }
      }

      return token;
    },

    // Session 回调 — 将 token 信息暴露给客户端
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.isPremium = token.isPremium as boolean;
        session.user.freeTrialUsed = token.freeTrialUsed as number;
      }
      return session;
    },

    // 登录重定向控制
    authorized: ({ auth, request }) => {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // 公开路由 — 无需登录即可访问
      const publicPaths = [
        '/',
        '/login',
        '/register',
        '/logout',
        '/forgot-password',
        '/chat', // AI 职导对话页公开，聊天组件自行检查登录
        '/mentors', // 导师列表和详情页公开，聊天组件自行检查登录
        '/payment/mock', // Mock 支付页面 (开发环境)
        '/api/auth',
        '/api/logout',
        '/api/chat', // chat API 自身做权限校验
        '/api/payment/notify', // 微信支付回调 (服务器间调用)
        '/api/payment/mock-pay', // Mock 支付 (开发环境模拟回调)
      ];
      const isPublicPath = publicPaths.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
      );

      // 已登录用户访问登录/注册页 → 重定向到首页
      if (isLoggedIn && (pathname === '/login' || pathname === '/register')) {
        return Response.redirect(new URL('/', request.nextUrl));
      }

      // 未登录用户访问受保护路由 → 显式重定向到登录页，保留 callbackUrl
      if (!isLoggedIn && !isPublicPath) {
        const loginUrl = new URL('/login', request.nextUrl.origin);
        loginUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
        return Response.redirect(loginUrl);
      }

      return true;
    },
  },

  // 安全配置
  cookies: {
    sessionToken: {
      name: 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  // 调试模式 (仅开发环境)
  debug: process.env.NODE_ENV === 'development',
});
