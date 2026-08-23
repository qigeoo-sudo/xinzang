/**
 * 退出登录 Route Handler
 * POST /api/logout — 清除 session cookie 并返回 JSON
 *
 * 仅接受 POST 防止 CSRF（GET 无法被 <img> 等标签触发状态变更）
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
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
  }

  return response;
}
