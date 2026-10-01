/**
 * 导师 SABC 评分引擎 — 纯逻辑测试
 *
 * 运行：
 *   npx tsx --test tests/tier-score.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AMORT_DAYS,
  CREDIT_PACK_UNIT_YUAN,
  scoreMentors,
  assignTiers,
  attributePaymentMentor,
  overlapDays,
  type AttributedCard,
  type CreditPackUse,
} from '../src/lib/tier-score';

const M = 'lydiachen';

/** 造一张区间内全程有效的卡 */
function card(plan: AttributedCard['plan'], paidAmount: number, mentorId: string | null = M, start = '2026-03-01', end = '2026-04-01'): AttributedCard {
  return { plan, paidAmount, startDate: start, endDate: end, mentorId };
}

describe('Lydia 2026-03-08 当日确认收入（用户给的例子）', () => {
  it('9 张有效月卡 + 1 张有效季卡 + 1 张年卡 + 6 轮加榨包；另有 1 月卡 1 季卡已到期不计', () => {
    // 有效：新增 4 月卡 + 存量 5 月卡 = 9；季卡新增 1（存量 1 张已到期）；年卡新增 1
    const cards: AttributedCard[] = [
      ...Array.from({ length: 9 }, () => card('MONTHLY', 29.9)),
      card('MONTHLY', 29.9, M, '2026-02-01', '2026-03-08'), // 到期日=3/8，当天不计
      card('QUARTERLY', 79.9),
      card('QUARTERLY', 79.9, M, '2025-12-01', '2026-03-01'), // 早已到期
      card('YEARLY', 269.9),
    ];
    const uses: CreditPackUse[] = [{ date: '2026-03-08', mentorId: M, rounds: 6 }];

    const r = scoreMentors({ start: '2026-03-08', end: '2026-03-08' }, cards, uses);

    const expected =
      (9 * 29.9) / AMORT_DAYS.MONTHLY +
      79.9 / AMORT_DAYS.QUARTERLY +
      269.9 / AMORT_DAYS.YEARLY +
      6 * CREDIT_PACK_UNIT_YUAN;
    assert.ok(Math.abs((r.byMentor.get(M) ?? 0) - expected) < 0.011, `got ${r.byMentor.get(M)}, want ${expected}`);
    assert.equal(r.otherAmount, 0);
    assert.equal(round2(r.creditPackAmount), round2(6 * 1.99));
    // 手算值约 22.37
    assert.ok(Math.abs((r.byMentor.get(M) ?? 0) - 22.37) < 0.011);
  });
});

describe('摊销区间', () => {
  it('新增当日计、到期当日不计', () => {
    assert.equal(overlapDays('2026-03-08', '2026-03-09', '2026-03-08', '2026-04-07'), 1);
    assert.equal(overlapDays('2026-03-08', '2026-03-09', '2026-03-01', '2026-03-08'), 0);
  });

  it('30 天月卡走完整个 30 天周期：确认收入=售价/30.5×30（常数分母口径，小于售价）', () => {
    const r = scoreMentors(
      { start: '2026-03-01', end: '2026-03-30' },
      [card('MONTHLY', 29.9, M, '2026-03-01', '2026-03-31')],
      [],
    );
    assert.equal(r.byMentor.get(M), round2((29.9 / 30.5) * 30)); // 29.41
  });

  it('周期外的卡与消耗不计', () => {
    const r = scoreMentors(
      { start: '2026-05-01', end: '2026-05-31' },
      [card('MONTHLY', 29.9, M, '2026-03-01', '2026-04-01')],
      [{ date: '2026-04-30', mentorId: M, rounds: 10 }],
    );
    assert.equal(r.byMentor.size, 0);
    assert.equal(r.creditPackAmount, 0);
  });

  it('加榨包购买不记分：只传消耗、不传购买，引擎本身只认消耗', () => {
    const r = scoreMentors({ start: '2026-03-01', end: '2026-03-31' }, [], [
      { date: '2026-03-02', mentorId: M, rounds: 3 },
      { date: '2026-03-03', mentorId: M, rounds: 0 },
    ]);
    assert.equal(r.byMentor.get(M), round2(3 * 1.99));
  });

  it('归因失败的卡金额进其他池，不进任何导师', () => {
    const r = scoreMentors(
      { start: '2026-03-08', end: '2026-03-08' },
      [card('MONTHLY', 29.9, null)],
      [],
    );
    assert.equal(r.byMentor.size, 0);
    assert.ok((r.otherAmount ?? 0) > 0);
  });
});

describe('SABC 分档', () => {
  it('20 位导师 → 1/3/6/10', () => {
    const amounts = new Map<string, number>();
    for (let i = 0; i < 20; i++) amounts.set(`m${String(i).padStart(2, '0')}`, 2000 - i * 50);
    const tiers = assignTiers(amounts);
    const count = (t: string) => [...tiers.values()].filter((x) => x === t).length;
    assert.equal(count('S'), 1);
    assert.equal(count('A'), 3);
    assert.equal(count('B'), 6);
    assert.equal(count('C'), 10);
    assert.equal(tiers.get('m00'), 'S');
    assert.equal(tiers.get('m01'), 'A');
    assert.equal(tiers.get('m09'), 'B');
    assert.equal(tiers.get('m10'), 'C');
  });

  it('5 位导师 → S 0 人（round(0.25)=0），A 1 人，B 2 人，C 2 人', () => {
    const amounts = new Map<string, number>(['a', 'b', 'c', 'd', 'e'].map((id, i) => [id, 100 - i]));
    const tiers = assignTiers(amounts);
    assert.equal(tiers.get('a'), 'A'); // rank1 落入 20% 档
    assert.equal(tiers.get('b'), 'B');
    assert.equal(tiers.get('c'), 'B');
    assert.equal(tiers.get('d'), 'C');
  });
});

describe('付费导师归因 attributePaymentMentor', () => {
  const t = (n: number) => n;
  const chat = (mentorId: string, n: number) => ({ mentorId, ts: t(n) });

  it('渠道绑定导师 → 优先级最高，行为记录全部指向别人也归渠道导师', () => {
    assert.equal(
      attributePaymentMentor({
        channelMentorId: 'lydia',
        chatsBefore: [chat('c', 1), chat('d', 2)],
        firstChatAfterMentor: 'c',
        profileViewsBefore: [chat('x', 1)],
      }),
      'lydia',
    );
  });

  it('渠道绑定导师且付费后未再聊天 → 仍归渠道导师（无需行为验证）', () => {
    assert.equal(
      attributePaymentMentor({
        channelMentorId: 'lydia',
        chatsBefore: [],
        firstChatAfterMentor: null,
      }),
      'lydia',
    );
  });

  it('渠道未绑定导师（null）→ 回落到双向验证链路', () => {
    assert.equal(
      attributePaymentMentor({
        channelMentorId: null,
        chatsBefore: [chat('a', 1), chat('b', 2)],
        firstChatAfterMentor: 'b',
      }),
      'b',
    );
  });

  it('付费前最后对话 = 付费后首个对话 → 直接归属', () => {
    assert.equal(
      attributePaymentMentor({
        chatsBefore: [chat('a', 1), chat('b', 2)],
        firstChatAfterMentor: 'b',
      }),
      'b',
    );
  });

  it('末位不一致，向前回溯到一致的对话导师 → 归属', () => {
    assert.equal(
      attributePaymentMentor({
        chatsBefore: [chat('a', 1), chat('b', 2), chat('c', 3), chat('d', 4)],
        firstChatAfterMentor: 'b',
      }),
      'b',
    );
  });

  it('对话记录无一致，主页浏览记录兜底命中 → 归属', () => {
    assert.equal(
      attributePaymentMentor({
        chatsBefore: [chat('c', 1), chat('d', 2)],
        firstChatAfterMentor: 'b',
        profileViewsBefore: [chat('x', 1), chat('b', 2)],
      }),
      'b',
    );
  });

  it('全部找不到一致 → null（其他）', () => {
    assert.equal(
      attributePaymentMentor({
        chatsBefore: [chat('c', 1), chat('d', 2)],
        firstChatAfterMentor: 'b',
        profileViewsBefore: [chat('x', 1), chat('y', 2)],
      }),
      null,
    );
  });

  it('付费后未再聊天 → null（无法验证）', () => {
    assert.equal(
      attributePaymentMentor({
        chatsBefore: [chat('a', 1)],
        firstChatAfterMentor: null,
      }),
      null,
    );
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
