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
import { getLockDurationMinutes } from '@/lib/lockout';
import { z } from 'zod';

// 登录凭据校验 Schema — 仅支持手机号登录
const credentialsSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号'),
  password: z.string().min(1, '密码不能为空'),
});

export const { handlers, auth } = NextAuth({
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
      name: '手机密码登录',
      credentials: {
        phone: { label: '手机号', type: 'tel' },
        password: { label: '密码', type: 'password' },
      },
      authorize: async (credentials) => {
        try {
          // 输入校验 — 防止注入
          const parsed = credentialsSchema.safeParse(credentials);
          if (!parsed.success) {
            return null;
          }

          const { phone, password } = parsed.data;

          // 按手机号查询用户
          const user = await prisma.user.findUnique({
            where: { phone },
          });

          // 用户不存在或未设置密码
          if (!user || !user.passwordHash) {
            return null;
          }

          // 账户锁定检查: 指数退避锁定策略
          if (user.lockUntil && user.lockUntil > new Date()) {
            return null;
          }

          // 锁定期已过，清除 lockUntil 但保留 loginAttempts（用于下次锁定时长计算）
          if (user.lockUntil && user.lockUntil <= new Date()) {
            await prisma.user.update({
              where: { id: user.id },
              data: { lockUntil: null },
            });
            user.lockUntil = null;
          }

          // 验证密码
          const isValid = await verifyPassword(password, user.passwordHash);
          if (!isValid) {
            const newAttempts = user.loginAttempts + 1;
            const lockMinutes = getLockDurationMinutes(newAttempts);
            await prisma.user.update({
              where: { id: user.id },
              data: {
                loginAttempts: newAttempts,
                lockUntil: lockMinutes > 0 ? new Date(Date.now() + lockMinutes * 60000) : null,
              },
            });
            return null;
          }

          // 登录成功: 重置失败计数
          await prisma.user.update({
            where: { id: user.id },
            data: {
              loginAttempts: 0,
              lockUntil: null,
              lastLoginAt: new Date(),
            },
          });

          // 返回用户信息 (写入 JWT)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isPremium: user.isPremium,
            freeTrialUsed: user.freeTrialUsed,
            passwordChangedAt: user.passwordChangedAt,
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
    jwt: async ({ token, user }) => {
      // 初次登录时，user 对象来自 authorize 返回值
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.isPremium = (user as any).isPremium;
        token.freeTrialUsed = (user as any).freeTrialUsed;
        token.passwordChangedAt = (user as any).passwordChangedAt?.getTime() || null;
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
        '/register-v2', // 注册流程页（公开，注册完成自动建会话）
        '/assessment', // RIASEC 职业兴趣测试（访客可测，保存结果时再引导注册）
        '/search', // 导师关键词搜索结果页（公开）
        '/logout',
        '/forgot-password',
        '/mentors', // 导师列表和详情页公开，聊天组件自行检查登录
        '/r', // 渠道短链（扫码发生在登录/注册之前，匿名可达）
        '/payment/mock', // Mock 支付页面 (开发环境)
        '/api/auth',
        '/api/logout',
        '/api/chat', // chat API 自身做权限校验
        '/api/assessment', // 测评结果接口自身做 401 校验
        '/api/payment/notify', // 微信支付回调 (服务器间调用)
        '/api/maintenance', // 维护任务 (CRON_SECRET 鉴权)
        '/api/payment/mock-pay', // Mock 支付 (开发环境模拟回调)
      ];
      const isPublicPath = publicPaths.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
      );

      // 已登录用户访问登录页 → 重定向到首页
      if (isLoggedIn && pathname === '/login') {
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
