/**
 * 渠道短链 /r/{code}
 *
 * 二维码内容指向这里：校验渠道 → 写首次触点 cookie（httpOnly，30 天）→ 跳渠道落地页。
 * - 渠道不存在或已停用：不写 cookie，直接跳首页（按自然量处理，不暴露渠道是否存在）
 * - 防开放重定向：落地路径必须是以单个 / 开头的站内路径
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ATTR_COOKIE, ATTR_MAX_AGE } from '@/lib/attribution';

export const dynamic = 'force-dynamic';

function safeLandingPath(path: string | null | undefined): string {
  if (path && /^\/(?!\/)[^\s]*$/.test(path)) return path;
  return '/';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = params.code;

  let landing = '/';
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(code)) {
    const channel = await prisma.channel.findUnique({
      where: { code },
      select: { status: true, landingPath: true },
    });
    if (channel && channel.status === 'ACTIVE') {
      landing = safeLandingPath(channel.landingPath);
      const response = NextResponse.redirect(new URL(landing, request.url));
      response.cookies.set(ATTR_COOKIE, JSON.stringify({
        ch: code,
        landing,
        ts: new Date().toISOString(),
      }), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: ATTR_MAX_AGE,
      });
      return response;
    }
  }

  return NextResponse.redirect(new URL(landing, request.url));
}
