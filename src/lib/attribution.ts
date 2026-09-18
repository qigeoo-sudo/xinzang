/**
 * 渠道归因 — 服务端工具
 *
 * 链路：渠道链接 /r/{code}（或 ?ch=xxx&utm_*=...）落地
 *   → 首次触点写入 ch_attr cookie（30 天，首次锁定不覆盖）
 *   → 注册时读取快照，校验渠道有效后盖章到 User.channelId + User.attributionJson
 *
 * 原则：
 * - 归因失败绝不阻断注册：渠道码无效/过期时按自然量处理（channelId=null）
 * - 只有 ACTIVE 渠道可以归因；停用后旧链接不再产生新归因
 * - 分成比例等敏感字段只存在服务端，用户侧只传渠道码
 */
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const ATTR_COOKIE = 'ch_attr';
export const ATTR_MAX_AGE = 30 * 24 * 60 * 60; // 30 天

/** 首次触点快照（客户端与 /r 短链写入的 JSON 结构） */
export interface AttributionSnapshot {
  /** 渠道码（/r/{code} 或 ?ch=） */
  ch?: string;
  source?: string; // utm_source
  medium?: string; // utm_medium
  campaign?: string; // utm_campaign
  term?: string; // utm_term
  content?: string; // utm_content
  /** 首次落地的站内路径 */
  landing?: string;
  /** 首次触点时间 ISO */
  ts?: string;
}

const SNAPSHOT_KEYS: (keyof AttributionSnapshot)[] = [
  'ch',
  'source',
  'medium',
  'campaign',
  'term',
  'content',
  'landing',
  'ts',
];

/** 容错解析快照，非法 JSON / 非对象一律返回 null */
export function parseAttribution(raw: string | undefined | null): AttributionSnapshot | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    const snap: AttributionSnapshot = {};
    for (const key of SNAPSHOT_KEYS) {
      const v = (obj as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) snap[key] = v.slice(0, 300);
    }
    return snap.ch ? snap : null; // 无渠道码的快照不具备归因意义
  } catch {
    return null;
  }
}

/**
 * 注册时取归因快照：httpOnly cookie（/r 短链写入）优先，
 * 其次用请求体里的 attribution（前端 localStorage 兜底，应对微信内浏览器换环境）
 */
export function readAttribution(
  request: NextRequest,
  bodyPayload?: unknown,
): AttributionSnapshot | null {
  const fromCookie = parseAttribution(request.cookies.get(ATTR_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  if (bodyPayload && typeof bodyPayload === 'object') {
    return parseAttribution(JSON.stringify(bodyPayload));
  }
  return null;
}

/**
 * 校验并解析有效渠道。
 * 返回 null 表示自然量（无码/脏码/已停用），注册正常继续，只是不盖章。
 */
export async function resolveActiveChannel(
  code: string | undefined,
): Promise<{ id: string; code: string } | null> {
  if (!code) return null;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(code)) return null;
  const channel = await prisma.channel.findUnique({
    where: { code },
    select: { id: true, code: true, status: true },
  });
  if (!channel || channel.status !== 'ACTIVE') return null;
  return { id: channel.id, code: channel.code };
}
