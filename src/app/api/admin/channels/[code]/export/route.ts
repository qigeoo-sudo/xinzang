/**
 * 渠道用户导出 CSV（仅 ADMIN）— 分成反查/对账用
 * GET /api/admin/channels/{code}/export
 *
 * 一行一个注册用户：联系方式、注册时间、首次触点快照、累计付费。
 * UTF-8 BOM，Excel 直接打开不乱码。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminUserId } from '@/lib/admin';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const adminId = await getAdminUserId();
  if (!adminId) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }
  const rateCheck = rateLimit(`admin-channel-export:${adminId}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: params.code },
    select: { id: true, code: true, name: true },
  });
  if (!channel) {
    return NextResponse.json({ error: '渠道不存在' }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    where: { channelId: channel.id },
    select: {
      name: true,
      phone: true,
      email: true,
      createdAt: true,
      attributionJson: true,
      payments: {
        where: { status: 'PAID' },
        select: { amount: true, paidAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const header = [
    '渠道码',
    '渠道名称',
    '用户昵称',
    '手机号',
    '邮箱',
    '注册时间',
    '首次触点时间',
    '首次来源',
    '媒介',
    '活动',
    '付费总额(元)',
    '付费次数',
    '最近付费时间',
  ];

  const lines = [header.map(csvCell).join(',')];
  for (const u of users) {
    let snap: Record<string, string> = {};
    try {
      if (u.attributionJson) snap = JSON.parse(u.attributionJson);
    } catch {}
    const paid = u.payments;
    const revenue = paid.reduce((sum, o) => sum + Number(o.amount), 0);
    const lastPaid = paid
      .map((o) => o.paidAt)
      .filter(Boolean)
      .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0];

    lines.push(
      [
        channel.code,
        channel.name,
        u.name,
        u.phone,
        u.email,
        fmtDate(u.createdAt),
        snap.ts ? fmtDate(new Date(snap.ts)) : '',
        snap.source,
        snap.medium,
        snap.campaign,
        revenue.toFixed(2),
        paid.length,
        fmtDate(lastPaid ?? null),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  const csv = '﻿' + lines.join('\r\n');
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="channel-${channel.code}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
