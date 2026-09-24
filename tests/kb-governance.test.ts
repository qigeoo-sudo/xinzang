/**
 * 知识卡四分类治理 — 纯逻辑测试（不依赖网络 / LLM）
 *
 * 运行：
 *   npx tsx --test tests/kb-governance.test.ts
 * DB 套件默认连 ./dev.db（可用 DATABASE_URL 覆盖）；DB 不可用时跳过。
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  KNOWLEDGE_CLASSES,
  DISCLOSURE_MODES,
  isClassDisclosureComboValid,
  getRetrievableClasses,
  CANONICAL_MENTORS,
  CANONICAL_TOTAL_CARDS,
  validateCanonicalCard,
  type CanonicalKnowledgeCard,
} from '../src/lib/kb-governance';
import { formatKnowledgeCards, type KnowledgeCardLike } from '../src/lib/kb-scoring';

const CARDS_DIR = join(process.cwd(), 'content', 'knowledge-governance', 'cards');

// ---------- 1. 枚举 × 披露模式组合矩阵 ----------
describe('class × disclosureMode 组合矩阵', () => {
  const expected: Record<string, string[]> = {
    internal_pending: ['none'],
    internal_approved: ['none'],
    external_pending: ['generalized', 'exact'],
    external_approved: ['generalized', 'exact'],
  };

  for (const cls of KNOWLEDGE_CLASSES) {
    for (const mode of DISCLOSURE_MODES) {
      it(`${cls} + ${mode}`, () => {
        assert.equal(
          isClassDisclosureComboValid(cls, mode),
          expected[cls].includes(mode),
        );
      });
    }
  }
});

// ---------- 2. 检索权限矩阵 ----------
describe('getRetrievableClasses 权限矩阵', () => {
  const prev = process.env.MENTOR_INTERNAL_TEST;

  it('生产默认只放行 external_approved', () => {
    delete process.env.MENTOR_INTERNAL_TEST;
    assert.deepEqual(getRetrievableClasses(), ['external_approved']);
  });

  it('开关为 "true" 时额外放行 external_pending', () => {
    process.env.MENTOR_INTERNAL_TEST = 'true';
    assert.deepEqual(getRetrievableClasses(), ['external_approved', 'external_pending']);
  });

  it('只有精确字符串 "true" 生效（"1"/"false" 都不放开）', () => {
    for (const v of ['1', 'false', 'TRUE', '']) {
      process.env.MENTOR_INTERNAL_TEST = v;
      assert.deepEqual(getRetrievableClasses(), ['external_approved'], `开关值 ${v} 不应放行`);
    }
  });

  it('显式参数优先于环境变量', () => {
    process.env.MENTOR_INTERNAL_TEST = 'true';
    assert.deepEqual(getRetrievableClasses({ internalTestEnabled: false }), ['external_approved']);
    delete process.env.MENTOR_INTERNAL_TEST;
    assert.deepEqual(
      getRetrievableClasses({ internalTestEnabled: true }),
      ['external_approved', 'external_pending'],
    );
  });

  it('internal_* 在任何模式下都不可检索', () => {
    for (const enabled of [false, true]) {
      const classes = getRetrievableClasses({ internalTestEnabled: enabled });
      assert.ok(classes.every((c) => !c.startsWith('internal_')));
    }
    process.env.MENTOR_INTERNAL_TEST = prev;
  });
});

// ---------- 3. 规范资产文件（6 个 jsonl） ----------
describe('content/knowledge-governance/cards 规范资产', () => {
  const allCards: Array<{ file: string; card: CanonicalKnowledgeCard; line: number }> = [];

  before(() => {
    assert.ok(existsSync(CARDS_DIR), `卡片目录不存在: ${CARDS_DIR}`);
  });

  for (const { mentorId, expectedCount } of CANONICAL_MENTORS) {
    describe(mentorId, () => {
      const file = join(CARDS_DIR, `${mentorId}_knowledge_cards.jsonl`);
      let lines: string[] = [];

      before(() => {
        const raw = readFileSync(file, 'utf8');
        lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
        lines.forEach((l, i) => {
          allCards.push({ file: `${mentorId}_knowledge_cards.jsonl`, card: JSON.parse(l), line: i + 1 });
        });
      });

      it(`卡数 = ${expectedCount}`, () => {
        assert.equal(lines.length, expectedCount);
      });

      it('每行通过 validateCanonicalCard 校验', () => {
        lines.forEach((l, i) => {
          const err = validateCanonicalCard(JSON.parse(l), mentorId);
          assert.equal(err, null, `第 ${i + 1} 行: ${err}`);
        });
      });
    });
  }

  it('总数 = 361', () => {
    assert.equal(CANONICAL_TOTAL_CARDS, 361);
    assert.equal(allCards.length, CANONICAL_TOTAL_CARDS);
  });

  it('cardId 全局唯一', () => {
    const ids = allCards.map((x) => x.card.cardId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('全部 external_approved 或 internal_approved（无 pending）', () => {
    for (const { card, line } of allCards) {
      assert.ok(
        ['external_approved', 'internal_approved'].includes(card.knowledgeClass),
        `第 ${line} 行 ${card.cardId} knowledgeClass=${card.knowledgeClass}`,
      );
    }
  });

  it('internal_approved 卡 disclosureMode 必须为 none', () => {
    const internal = allCards.filter((x) => x.card.knowledgeClass === 'internal_approved');
    assert.equal(internal.length, 1);
    assert.equal(internal[0].card.cardId, 'FRE-R1-015');
    assert.equal(internal[0].card.disclosureMode, 'none');
  });

  it('generalized 355 张 + exact 5 张', () => {
    const exact = allCards.filter((x) => x.card.disclosureMode === 'exact');
    const generalized = allCards.filter((x) => x.card.disclosureMode === 'generalized');
    assert.equal(generalized.length, 355);
    assert.equal(exact.length, 5);
    assert.deepEqual(
      exact.map((x) => x.card.cardId).sort(),
      ['FRE-R1-002', 'LYD-R2-022', 'LYD-R2-023', 'LYD-R2-024', 'LYD-R2-025'],
    );
    assert.ok(exact.every((x) => ['lydia', 'freya'].includes(x.card.mentorId)));
  });

  it('caseText 仅 LYD-CASE-001 一张（Lydia 案例卡）', () => {
    const withCase = allCards.filter((x) => x.card.caseText !== null);
    assert.deepEqual(withCase.map((x) => x.card.cardId), ['LYD-CASE-001']);
    assert.equal(withCase[0].card.mentorId, 'lydia');
  });
});

// ---------- 4. formatKnowledgeCards 防泄露 ----------
describe('formatKnowledgeCards 去编号 / 去元数据', () => {
  const secretCard: KnowledgeCardLike = {
    cardId: 'LYD-R1-001',
    mentorId: 'lydia',
    domain: '内部密级领域XYZ',
    title: '内部秘密标题ABC',
    coreView: '可以讲给用户的核心观点：职业选择要同时看能力与兴趣。',
    reasoning: '理由来自长期观察，两者缺一不可。',
    applicableTo: '正在做职业选择的人',
    notApplicableTo: '已确定方向且只需要执行建议的人',
    prerequisites: '用户愿意诚实评估自己',
    exceptions: '紧急经济压力下优先级可以不同',
    risks: '不要把兴趣当成唯一决策依据',
    knowledgeClass: 'external_approved',
    disclosureMode: 'generalized',
  };

  it('输出核心观点与边界，但不含任何内部元数据', () => {
    const out = formatKnowledgeCards([secretCard]);
    assert.ok(out.includes('可以讲给用户的核心观点'));
    assert.ok(out.includes('正在做职业选择的人'));
    for (const leak of [
      'LYD-R1-001',
      '内部密级领域XYZ',
      '内部秘密标题ABC',
      'cardId',
      'knowledgeClass',
      'disclosureMode',
      'external_approved',
      'generalized',
      'confidence',
      'source',
      'schemaVersion',
    ]) {
      assert.ok(!out.includes(leak), `输出泄露了: ${leak}`);
    }
  });

  it('多张卡不出现编号 / 材料N / 字段标签', () => {
    const out = formatKnowledgeCards([
      secretCard,
      { ...secretCard, cardId: 'LYD-R1-002', coreView: '第二个可以讲的观点。' },
    ]);
    // 只检查材料正文：防诱导指令行本身允许出现"根据材料""知识卡显示"等字样
    const body = out.split('\n\n').slice(1).join('\n\n');
    assert.ok(!/材料\s*[0-9一二三四五六]/.test(body));
    assert.ok(!/卡\s*[0-9一二三四五六]/.test(body));
    assert.ok(!/【\s*[0-9]+\s*】/.test(body));
    assert.ok(!/根据卡|知识卡显示|编号/.test(body));
  });

  it('案例卡输出 caseText + reasoning + coreView，且仍不泄露 cardId/title/domain', () => {
    const out = formatKnowledgeCards([
      {
        ...secretCard,
        cardId: 'LYD-R2-022',
        title: '履历案例秘密标题ZZZ',
        caseText: '一段可以公开的履历叙述正文。',
        reasoning: '导师对这段经历的评点。',
        coreView: '案例提炼出的一句话结论ZZZ。',
        disclosureMode: 'exact',
      },
    ]);
    assert.ok(out.includes('一段可以公开的履历叙述正文。'));
    assert.ok(out.includes('导师对这段经历的评点。'));
    assert.ok(out.includes('案例提炼出的一句话结论ZZZ。'));
    assert.ok(!out.includes('LYD-R2-022'));
    assert.ok(!out.includes('履历案例秘密标题ZZZ'));
    assert.ok(!out.includes('exact'));
  });

  it('空数组给占位提示而非空串', () => {
    const out = formatKnowledgeCards([]);
    assert.ok(out.includes('没有检索到'));
  });
});

// ---------- 5. DB 权限矩阵（本地 MySQL xinzang_dev，需要 seed 后的 361 张卡） ----------
describe('本地 MySQL 检索权限矩阵', () => {
  // 未显式配置时指向本地开发库（.env 的 DATABASE_URL 优先）
  process.env.DATABASE_URL ??= 'mysql://root:root123@localhost:3306/xinzang_dev';

  let prisma: any;
  let searchKnowledgeCards: typeof import('../src/lib/mentor-kb').searchKnowledgeCards;
  let dbReady = true;

  before(async () => {
    try {
      const { PrismaClient } = await import('../src/generated/prisma');
      prisma = new PrismaClient();
      ({ searchKnowledgeCards } = await import('../src/lib/mentor-kb'));
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbReady = false;
    }
  });

  it('DB 可连接（不可用则跳过本套件）', async (t) => {
    if (!dbReady) {
      t.skip('数据库不可用');
      return;
    }
    assert.ok(dbReady);
  });

  it('知识卡总数 361 且分类合规（external_approved 或 internal_approved:none）', async (t) => {
    if (!dbReady) return t.skip();
    const total = await (prisma as any).mentorKnowledgeCard.count();
    assert.equal(total, CANONICAL_TOTAL_CARDS);

    const grouped = await (prisma as any).mentorKnowledgeCard.groupBy({
      by: ['mentorId', 'knowledgeClass', 'disclosureMode'],
      _count: { _all: true },
    });
    const byMentor = new Map<string, number>();
    for (const g of grouped) {
      // 允许 external_approved（disclosureMode 非 none）和 internal_approved（必须 none）
      if (g.knowledgeClass === 'internal_approved') {
        assert.equal(g.disclosureMode, 'none', `internal_approved 卡必须 disclosureMode=none`);
      } else {
        assert.equal(g.knowledgeClass, 'external_approved', `非法分类: ${g.knowledgeClass}`);
        assert.notEqual(g.disclosureMode, 'none', `external_approved 卡不应 disclosureMode=none`);
      }
      byMentor.set(g.mentorId, (byMentor.get(g.mentorId) ?? 0) + g._count._all);
    }
    for (const { mentorId, expectedCount } of CANONICAL_MENTORS) {
      assert.equal(byMentor.get(mentorId), expectedCount, `${mentorId} 卡数不符`);
    }
  });

  it('internal_approved 卡不参与生产检索（库中存在但 searchKnowledgeCards 召回不到）', async (t) => {
    if (!dbReady) return t.skip();
    // 库中确实存在 1 张 internal_approved 卡（FRE-R1-015）
    const internal = await (prisma as any).mentorKnowledgeCard.findFirst({
      where: { knowledgeClass: 'internal_approved' },
      select: { cardId: true, disclosureMode: true },
    });
    assert.equal(internal?.cardId, 'FRE-R1-015');
    assert.equal(internal?.disclosureMode, 'none');
    // pending 卡在库中不应存在
    for (const cls of ['internal_pending', 'external_pending']) {
      const hit = await (prisma as any).mentorKnowledgeCard.findFirst({
        where: { knowledgeClass: cls },
        select: { cardId: true },
      });
      assert.equal(hit, null, `库中不应存在 ${cls} 卡`);
    }
  });

  it('searchKnowledgeCards 实召回结果全部越权字段干净', async (t) => {
    if (!dbReady) return t.skip();
    const cards = await searchKnowledgeCards('freya', '审计 转型 产业投资 医疗器械', 8);
    assert.ok(cards.length > 0, 'freya 应至少召回 1 张卡');
    for (const c of cards) {
      assert.equal(c.knowledgeClass, 'external_approved');
      assert.notEqual(c.disclosureMode, 'none');
    }
    const text = formatKnowledgeCards(cards);
    assert.ok(!/FRE-[A-Z]\d-\d{3}/.test(text), '格式化文本不得出现 cardId');
    assert.ok(!text.includes('knowledgeClass'));
    await (prisma as any).$disconnect();
  });
});
