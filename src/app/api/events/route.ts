/**
 * 行为事件批量上报 API
 * POST /api/events  { events: ClientEventInput[] }
 *
 * 安全要求（操作手册第 9 章）：
 * - 事件名白名单 + 每种事件独立 props 校验
 * - 单批数量与请求体大小上限
 * - 匿名与登录用户分别限流
 * - 拒绝客户端提交 userId/userGroup/anonymousId，身份一律服务端补写
 * - eventId 唯一约束幂等写入
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getClientIP, rateLimit } from '@/lib/rate-limit';
import {
  clientEventSchema,
  propsSchemas,
  sanitizePath,
} from '@/lib/analytics/event-schema';

const MAX_BATCH = 50;
const MAX_BODY_BYTES = 64 * 1024;
const ANON_COOKIE = 'aid';
const ANON_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const REQUESTS_PER_MINUTE = 20;

export async function POST(request: NextRequest) {
  // ---------- 请求体大小上限 ----------
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '请求体过大' }, { status: 413 });
  }

  // ---------- 身份与限流（匿名/登录分别计数） ----------
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const ip = getClientIP(request);
  const limitKey = userId ? `events:uid:${userId}` : `events:ip:${ip}`;
  const rate = rateLimit(limitKey, REQUESTS_PER_MINUTE, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: '上报过于频繁，请稍后再试' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求不是合法 JSON' }, { status: 400 });
  }

  const bodyParse = z
    .object({ events: z.array(z.unknown()).min(1).max(MAX_BATCH) })
    .strict()
    .safeParse(body);
  if (!bodyParse.success) {
    return NextResponse.json(
      { error: `events 需为非空数组且单批不超过 ${MAX_BATCH} 条` },
      { status: 400 }
    );
  }

  // ---------- 逐条校验，坏条目不影响好条目 ----------
  const rows: {
    eventId: string;
    eventName: string;
    page: string;
    target?: string;
    props: string;
    clientTs: Date;
    sessionId: string;
    pageInstanceId?: string;
    cmp?: string;
  }[] = [];
  const rejected: { eventId?: string; reason: string }[] = [];

  for (const raw of bodyParse.data.events) {
    const parsed = clientEventSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({
        eventId: (raw as Record<string, unknown>)?.eventId as string | undefined,
        reason: parsed.error.issues[0]?.message ?? '事件结构不合法',
      });
      continue;
    }
    const ev = parsed.data;
    const propsResult = propsSchemas[ev.eventName].safeParse(ev.props ?? {});
    if (!propsResult.success) {
      rejected.push({
        eventId: ev.eventId,
        reason: `props 不合法：${propsResult.error.issues[0]?.message ?? ''}`,
      });
      continue;
    }
    rows.push({
      eventId: ev.eventId,
      eventName: ev.eventName,
      page: sanitizePath(ev.page),
      target: ev.target,
      props: JSON.stringify(propsResult.data),
      clientTs: new Date(ev.clientTs),
      sessionId: ev.sessionId,
      pageInstanceId: ev.pageInstanceId,
      cmp: ev.cmp,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ accepted: 0, rejected }, { status: 400 });
  }

  // ---------- 服务端补写身份 ----------
  const ua = request.headers.get('user-agent');
  let anonymousId: string | null = request.cookies.get(ANON_COOKIE)?.value ?? null;

  let userGroupSnapshot: string | null = null;
  if (userId) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { userGroup: true },
    });
    userGroupSnapshot = me?.userGroup ?? null;
  }

  // ---------- 幂等写入（eventId 唯一，重复上报跳过） ----------
  await prisma.event.createMany({
    data: rows.map((r) => ({
      eventId: r.eventId,
      eventName: r.eventName,
      anonymousId,
      sessionId: r.sessionId,
      pageInstanceId: r.pageInstanceId,
      userId,
      userGroupSnapshot,
      page: r.page,
      target: r.target,
      props: r.props,
      clientTs: r.clientTs,
      ua,
      releaseVersion: process.env.RELEASE_VERSION || null,
      cmp: r.cmp,
    })),
    skipDuplicates: true,
  });

  const res = NextResponse.json({ accepted: rows.length, rejected });

  // 首次访问：种植匿名标识 cookie（httpOnly，JS 不可读，一年有效）
  if (!anonymousId) {
    anonymousId = crypto.randomUUID();
    res.cookies.set(ANON_COOKIE, anonymousId, {
      httpOnly: true,
      maxAge: ANON_COOKIE_MAX_AGE,
      sameSite: 'lax',
      path: '/',
      secure: request.headers.get('x-forwarded-proto') === 'https',
    });
  }

  return res;
}
