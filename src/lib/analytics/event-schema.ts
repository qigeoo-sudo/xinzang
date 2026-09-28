/**
 * 事件结构定义与校验 — 上报接口与数据测试共用
 * 对应操作手册第 6 章事件字典。新增事件时在此登记白名单与 props 结构。
 */
import { z } from 'zod';

export const EVENT_NAMES = [
  'page.view',
  'page.active_duration',
  'mentor_card.impression',
  'mentor_card.click',
  'mentor_profile.view',
  'paywall.view',
  'subscribe.click',
  'cta.click',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

const shortId = z.string().min(1).max(64);
const position = z.number().int().min(0).max(100);

/** 每种事件独立的 props 结构校验 */
export const propsSchemas: Record<EventName, z.ZodTypeAny> = {
  'page.view': z
    .object({
      referrer: z.string().max(300).optional(),
    })
    .strict(),
  'page.active_duration': z
    .object({
      activeSeconds: z.number().int().min(1).max(3600),
      segmentNo: z.number().int().min(0).max(1000),
      pageInstanceId: shortId,
      mentorId: shortId.optional(),
    })
    .strict(),
  'mentor_card.impression': z
    .object({
      mentorId: shortId,
      position,
      sourcePage: z.string().max(120),
      ctaId: shortId,
    })
    .strict(),
  'mentor_card.click': z
    .object({
      mentorId: shortId,
      position,
      sourcePage: z.string().max(120),
      ctaId: shortId,
    })
    .strict(),
  'mentor_profile.view': z
    .object({
      mentorId: shortId,
      from: z.enum(['card_click', 'direct', 'search']),
    })
    .strict(),
  'paywall.view': z
    .object({
      from: z.string().max(120).optional(),
      sourceMentorId: shortId.optional(),
    })
    .strict(),
  'subscribe.click': z
    .object({
      plan: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY', 'CREDIT_PACK']),
      ctaId: shortId,
    })
    .strict(),
  'cta.click': z
    .object({
      ctaId: shortId,
      label: z.string().max(60).optional(),
    })
    .strict(),
};

/** 客户端上报的事件外层结构；strict 拒绝 userId/userGroup/anonymousId 等身份字段 */
export const clientEventSchema = z
  .object({
    eventId: z.string().uuid(),
    eventName: z.enum(EVENT_NAMES),
    page: z.string().min(1).max(200),
    target: z.string().max(100).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    clientTs: z.number().int().nonnegative(),
    sessionId: shortId,
    pageInstanceId: shortId.optional(),
    cmp: z.string().max(64).optional(),
  })
  .strict();

export type ClientEventInput = z.infer<typeof clientEventSchema>;

/** 去除路径中的查询参数与 hash（服务端再做一次，不信任客户端） */
export function sanitizePath(raw: string): string {
  const cut = raw.search(/[?#]/);
  return (cut === -1 ? raw : raw.slice(0, cut)).slice(0, 200);
}
