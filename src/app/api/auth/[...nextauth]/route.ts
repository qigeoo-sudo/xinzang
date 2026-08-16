/**
 * Auth.js v5 路由处理器
 * 处理 /api/auth/* 下的所有认证请求
 *
 * 显式指定 Node.js runtime — bcryptjs 和 Prisma 不兼容 Edge Runtime
 */
import { handlers } from '@/auth';

export const runtime = 'nodejs';
export const { GET, POST } = handlers;
