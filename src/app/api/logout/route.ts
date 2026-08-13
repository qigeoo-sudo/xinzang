/**
 * 退出登录 Route Handler
 * GET /api/logout — 清除 session cookie 并返回 JSON
 *
 * 使用 JSON 响应 + 客户端跳转，避免沙盒隧道环境重定向失败
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // 清除所有可能的 session cookie
  const cookieNames = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'authjs.callback-url',
    '__Secure-authjs.callback-url',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.callback-url',
    '__Secure-next-auth.callback-url',
  ];

  const response = NextResponse.json({ success: true, redirect: '/' });

  for (const name of cookieNames) {
    response.cookies.set(name, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set(name, '', {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  return response;
}
