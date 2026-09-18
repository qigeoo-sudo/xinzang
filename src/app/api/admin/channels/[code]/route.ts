/**
 * 渠道编辑 API（仅 ADMIN）
 * PATCH /api/admin/channels/{code}  修改渠道信息 / 启用停用
 * 注意：code 不允许修改（已有用户的归因快照依赖它），只能新建渠道
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminUserId } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const landingRegex = /^\/(?!\/)[^\s]*$/;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  partner: z.string().trim().max(50).optional().nullable(),
  shareRate: z.coerce.number().int().min(0).max(100).optional().nullable(),
  landingPath: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((v) => v === undefined || landingRegex.test(v), '落地路径必须是以 / 开头的站内路径'),
  note: z.string().trim().max(200).optional().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  if (!(await getAdminUserId())) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || '输入不合法' },
      { status: 400 },
    );
  }

  const existing = await prisma.channel.findUnique({ where: { code: params.code } });
  if (!existing) {
    return NextResponse.json({ error: '渠道不存在' }, { status: 404 });
  }

  const d = parsed.data;
  const channel = await prisma.channel.update({
    where: { code: params.code },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.partner !== undefined ? { partner: d.partner || null } : {}),
      ...(d.shareRate !== undefined ? { shareRate: d.shareRate ?? null } : {}),
      ...(d.landingPath !== undefined ? { landingPath: d.landingPath } : {}),
      ...(d.note !== undefined ? { note: d.note || null } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
    },
  });

  return NextResponse.json({ channel });
}
