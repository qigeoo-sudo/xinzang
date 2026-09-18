/**
 * 渠道二维码 PNG（仅 ADMIN）
 * GET /api/admin/channels/{code}/qrcode
 *
 * 二维码内容：{站点域名}/r/{code}
 * 域名优先级：PUBLIC_BASE_URL 环境变量 → AUTH_URL/NEXTAUTH_URL → 请求头推断（显式配置最可靠）
 */
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { getAdminUserId } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function resolveBaseUrl(request: NextRequest): string {
  const explicit =
    process.env.PUBLIC_BASE_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host) return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
  return request.nextUrl.origin;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  if (!(await getAdminUserId())) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(params.code)) {
    return NextResponse.json({ error: '渠道码不合法' }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: params.code },
    select: { code: true },
  });
  if (!channel) {
    return NextResponse.json({ error: '渠道不存在' }, { status: 404 });
  }

  const targetUrl = `${resolveBaseUrl(request)}/r/${channel.code}`;
  const png = await QRCode.toBuffer(targetUrl, {
    errorCorrectionLevel: 'M',
    width: 480,
    margin: 2,
    color: { dark: '#2B2A28', light: '#FFFFFF' },
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `inline; filename="qr-${channel.code}.png"`,
      'X-Target-Url': targetUrl,
    },
  });
}
