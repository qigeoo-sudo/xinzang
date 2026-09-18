/**
 * 渠道管理 API（仅 ADMIN）
 * GET  /api/admin/channels        渠道列表 + 注册/付费/收入统计
 * POST /api/admin/channels        新建渠道
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminUserId } from '@/lib/admin';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const codeRegex = /^[a-zA-Z0-9_-]{2,64}$/;
const landingRegex = /^\/(?!\/)[^\s]*$/; // 必须是以单个 / 开头的站内路径

const createSchema = z.object({
  code: z.string().trim().regex(codeRegex, '渠道码为 2-64 位字母/数字/_/-'),
  name: z.string().trim().min(1, '请填写渠道名称').max(50),
  partner: z.string().trim().max(50).optional().nullable(),
  shareRate: z.coerce.number().int().min(0).max(100).optional().nullable(),
  landingPath: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : '/'))
    .refine((v) => landingRegex.test(v), '落地路径必须是以 / 开头的站内路径'),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function GET() {
  if (!(await getAdminUserId())) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  const channels = await prisma.channel.findMany({
    orderBy: { createdAt: 'desc' },
  });
  const channelIds = channels.map((c) => c.id);

  // 每渠道注册数
  const regGroups = await prisma.user.groupBy({
    by: ['channelId'],
    where: { channelId: { in: channelIds } },
    _count: { _all: true },
  });
  const regCountMap = new Map(regGroups.map((g) => [g.channelId ?? '', g._count._all]));

  // 这些渠道下的全部用户 id（用于付费聚合）
  const users = await prisma.user.findMany({
    where: { channelId: { in: channelIds } },
    select: { id: true, channelId: true, createdAt: true },
  });
  const userIdToChannel = new Map(users.map((u) => [u.id, u.channelId ?? '']));

  const paidOrders = await prisma.paymentOrder.findMany({
    where: { status: 'PAID', userId: { in: [...userIdToChannel.keys()] } },
    select: { amount: true, userId: true, paidAt: true },
  });

  const statsMap = new Map<
    string,
    { registrations: number; paidUsers: number; revenue: number; lastPaidAt: string | null }
  >();
  for (const ch of channels) {
    statsMap.set(ch.id, {
      registrations: regCountMap.get(ch.id) ?? 0,
      paidUsers: 0,
      revenue: 0,
      lastPaidAt: null,
    });
  }
  const paidUserSet = new Map<string, Set<string>>();
  for (const order of paidOrders) {
    const chId = userIdToChannel.get(order.userId);
    if (!chId) continue;
    const stat = statsMap.get(chId);
    if (!stat) continue;
    stat.revenue += Number(order.amount);
    if (!stat.lastPaidAt || (order.paidAt && order.paidAt.toISOString() > stat.lastPaidAt)) {
      stat.lastPaidAt = order.paidAt ? order.paidAt.toISOString() : stat.lastPaidAt;
    }
    let set = paidUserSet.get(chId);
    if (!set) {
      set = new Set<string>();
      paidUserSet.set(chId, set);
    }
    set.add(order.userId);
  }
  for (const [chId, set] of paidUserSet) {
    const stat = statsMap.get(chId);
    if (stat) stat.paidUsers = set.size;
  }

  return NextResponse.json({
    channels: channels.map((ch) => ({
      ...ch,
      createdAt: ch.createdAt.toISOString(),
      updatedAt: ch.updatedAt.toISOString(),
      stats: statsMap.get(ch.id),
    })),
  });
}

export async function POST(request: NextRequest) {
  const adminId = await getAdminUserId();
  if (!adminId) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }
  const rateCheck = rateLimit(`admin-channels:${adminId}`, 30, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || '输入不合法' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  try {
    const channel = await prisma.channel.create({
      data: {
        code: data.code,
        name: data.name,
        partner: data.partner || null,
        shareRate: data.shareRate ?? null,
        landingPath: data.landingPath || '/',
        note: data.note || null,
      },
    });
    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    // P2002 = 唯一约束冲突（渠道码重复）
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: '渠道码已存在，换一个' }, { status: 409 });
    }
    console.error('[admin] create channel error:', error);
    return NextResponse.json({ error: '创建失败，请稍后再试' }, { status: 500 });
  }
}
