/**
 * NextAuth v5 类型扩展
 * 扩展 Session 和 JWT 类型，携带自定义字段
 */
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      isPremium: boolean;
      freeTrialUsed: number;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
    isPremium?: boolean;
    freeTrialUsed?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    isPremium?: boolean;
    freeTrialUsed?: number;
  }
}
