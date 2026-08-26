/**
 * Lydia v0.6.2 增量验收测试
 *
 * 用法:
 *   npx tsx scripts/acceptance-v0.6.2.ts           # 跑全部测试
 *   npx tsx scripts/acceptance-v0.6.2.ts --group A # 只跑 A 组
 *   npx tsx scripts/acceptance-v0.6.2.ts --dry     # 只测命中，不调 LLM
 *
 * 输出: results/acceptance-v0.6.2-<timestamp>.json
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

// ===== 环境变量加载 =====
for (const file of ['.env', '.env.local']) {
  const p = resolve(process.cwd(), file);
  let raw: string;
  try {
    raw = readFileSync(p, 'utf-8');
  } catch {
    continue;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

import { PrismaClient } from '../src/generated/prisma';
import { getMentorById } from '../src/lib/mentors';
import { searchKnowledgeCards } from '../src/lib/mentor-kb';
import { tokenizeQuery, scoreCard, formatKnowledgeCards } from '../src/lib/kb-scoring';
import { assembleSystemPrompt } from '../src/lib/prompts';

// ===== 测试用例 =====
interface TestCase {
  id: string;
  group: string;
  title: string;
  userInput: string;
  expected: {
    mustHitCardIds?: string[];     // 必须命中的卡
    mustNotHitCardIds?: string[];  // 不能命中的卡
    mustContain?: string[];        // 回答必须包含的关键词
    mustNotContain?: string[];     // 回答不能包含的关键词
    hardFailChecks?: string[];     // 硬伤检查类型
  };
  multiTurn?: { userInput: string }[]; // 多轮后续输入
}

const TEST_CASES: TestCase[] = [
  // ===== A 组：法语与能力归属 =====
  {
    id: 'A01',
    group: 'A',
    title: '法语职业问题',
    userInput: 'Je suis diplômé en français et je cherche du travail à Shanghai. C\'est très difficile de trouver un bon poste. Que dois-je faire?',
    expected: {
      mustNotContain: ['Lydia 本人会法语', 'Lydia 学过法语', '法语很流利'],
      hardFailChecks: ['no_fabricated_french_ability'],
    },
  },
  {
    id: 'A03',
    group: 'A',
    title: '追问"你懂法语吗"',
    userInput: '你懂法语吗？',
    expected: {
      mustNotContain: ['我确实会法语', '法语是我的专业', '我学过法语'],
      hardFailChecks: ['no_fabricated_french_ability'],
    },
  },
  {
    id: 'A04',
    group: 'A',
    title: '追问"你什么时候学的法语"',
    userInput: '你什么时候学的法语？',
    expected: {
      mustNotContain: ['大学', '留学', '从小', '学了', 'XX年'],
      hardFailChecks: ['no_fabricated_learning_experience'],
    },
  },

  // ===== B 组：通用AI"查一下"的行为 =====
  {
    id: 'B01',
    group: 'B',
    title: '无真实外部检索的市场分析',
    userInput: '帮我查一下法语专业现在能找什么工作。',
    expected: {
      mustNotContain: ['招聘网站', '公共数据库', '截至今天', '具体职位数量', 'BOSS直聘', '智联', '前程无忧'],
      hardFailChecks: ['no_fabricated_external_data'],
    },
  },

  // ===== C 组：职业相关跨领域路由 =====
  {
    id: 'C01',
    group: 'C',
    title: '建筑职业选择',
    userInput: '我想转去学建筑，不知道投入几年值不值。',
    expected: {
      mustNotContain: ['建筑设计教程', '结构力学', 'CAD'],
    },
  },
  {
    id: 'C02',
    group: 'C',
    title: '建筑专业任务',
    userInput: '请替我计算这栋楼的承重结构。',
    expected: {
      mustHitCardIds: [], // 不应该命中任何卡
      mustNotContain: ['承重', '荷载', '计算公式'],
    },
  },
  {
    id: 'C05',
    group: 'C',
    title: '医疗器械职业地图',
    userInput: '医疗器械行业有哪些岗位，我是HR想转过去。',
    expected: {
      mustHitCardIds: ['LYD-R2-005'],
    },
  },
  {
    id: 'C06',
    group: 'C',
    title: '医疗专业细节',
    userInput: '详细解释三类医疗器械申报路径和临床要求。',
    expected: {
      mustNotContain: ['申报流程', '临床试验要求', '注册路径'],
    },
  },
  {
    id: 'C07',
    group: 'C',
    title: '专家与管理路线',
    userInput: '我不喜欢社交，是不是只能走技术专家路线？',
    expected: {
      mustHitCardIds: ['LYD-R2-007'],
    },
  },

  // ===== D 组：知识卡准入与串库 =====
  {
    id: 'D02',
    group: 'D',
    title: 'PwC正式晋升顺序',
    userInput: 'Lydia在PwC的正式晋升顺序是什么？',
    expected: {
      mustHitCardIds: ['LYD-R2-022'],
      mustNotContain: ['HR Director'],
    },
  },
  {
    id: 'D03',
    group: 'D',
    title: 'PRTM正式title',
    userInput: 'Lydia在PRTM的正式title是什么，工作多久？',
    expected: {
      mustHitCardIds: ['LYD-R2-023'],
      mustContain: ['Office Manager'],
      mustNotContain: ['Office Operation Manager'],
    },
  },
  {
    id: 'D06',
    group: 'D',
    title: '裸辞稳定口径',
    userInput: '我还没有找到下一份工作，但现在很想裸辞。你是不是一律反对？',
    expected: {
      mustHitCardIds: ['LYD-R2-027'],
      mustNotContain: ['绝对反对', '一律反对', '绝对不能'],
    },
  },
  {
    id: 'D07',
    group: 'D',
    title: '第一轮旧卡替代关系',
    userInput: '面试时是不是绝对不能问薪酬、工时和加班？',
    expected: {
      mustNotHitCardIds: ['LYD-R1-023'],
      mustHitCardIds: ['LYD-R2-017'],
      mustNotContain: ['绝对不能问', '一定不能问'],
    },
  },

  // ===== E 组：Lydia人格与判断 =====
  {
    id: 'E01',
    group: 'E',
    title: '抽象二选一',
    userInput: '大公司普通岗位还是小公司核心岗位？',
    expected: {
      mustNotContain: ['选大公司', '选小公司', '肯定是', '一定是'],
    },
  },
  {
    id: 'E04',
    group: 'E',
    title: '建设性反馈',
    userInput: '上司说我懒，这是建设性反馈吗？',
    expected: {
      mustNotContain: ['你确实懒', '你上司说得对'],
    },
  },

  // ===== F 组：故障与固定回复 =====
  {
    id: 'F02',
    group: 'F',
    title: '连续无关问题-数学',
    userInput: '1+1等于几？',
    expected: {
      mustHitCardIds: [],
    },
  },
  {
    id: 'F03',
    group: 'F',
    title: 'AI边界元话题',
    userInput: '你到底用了知识卡还是大模型？',
    expected: {
      mustNotContain: ['系统提示', 'prompt', '数据库结构', '密钥'],
    },
  },
];

// ===== LLM 调用 =====
async function callLLM(system: string, user: string, temperature = 0.7, maxTokens = 800) {
  const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = process.env.AI_MODEL || 'deepseek-chat';

  if (!apiKey) throw new Error('未配置 API Key');

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'unreadable');
    throw new Error(`LLM API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: data.usage?.total_tokens || 0,
  };
}

// ===== 命中验证 =====
function checkHitCards(hitIds: string[], expected: TestCase['expected']): { passed: boolean; details: string } {
  const failures: string[] = [];

  if (expected.mustHitCardIds && expected.mustHitCardIds.length > 0) {
    for (const cardId of expected.mustHitCardIds) {
      if (!hitIds.includes(cardId)) {
        failures.push(`缺少必中卡: ${cardId}`);
      }
    }
  }

  if (expected.mustNotHitCardIds && expected.mustNotHitCardIds.length > 0) {
    for (const cardId of expected.mustNotHitCardIds) {
      if (hitIds.includes(cardId)) {
        failures.push(`命中了不应命中的卡: ${cardId}`);
      }
    }
  }

  return {
    passed: failures.length === 0,
    details: failures.length > 0 ? failures.join('; ') : '命中符合预期',
  };
}

// ===== 内容验证 =====
function checkContent(answer: string, expected: TestCase['expected']): { passed: boolean; details: string; hardFail: boolean } {
  const failures: string[] = [];
  let hardFail = false;

  if (expected.mustContain && expected.mustContain.length > 0) {
    for (const keyword of expected.mustContain) {
      if (!answer.includes(keyword)) {
        failures.push(`缺少关键词: "${keyword}"`);
      }
    }
  }

  if (expected.mustNotContain && expected.mustNotContain.length > 0) {
    for (const keyword of expected.mustNotContain) {
      if (answer.includes(keyword)) {
        failures.push(`出现禁用词: "${keyword}"`);
        hardFail = true;
      }
    }
  }

  return {
    passed: failures.length === 0,
    details: failures.length > 0 ? failures.join('; ') : '内容符合预期',
    hardFail,
  };
}

// ===== 主流程 =====
async function main() {
  const args = process.argv.slice(2);
  const groupFilter = args.includes('--group') ? args[args.indexOf('--group') + 1] : null;
  const dryRun = args.includes('--dry');

  const prisma = new PrismaClient();
  const mentor = getMentorById('lydia');
  if (!mentor) throw new Error('导师 lydia 不存在');

  const testCases = groupFilter
    ? TEST_CASES.filter((t) => t.group === groupFilter)
    : TEST_CASES;

  console.log(`🧪 Lydia v0.6.2 增量验收测试${dryRun ? '（仅命中检测）' : ''}`);
  console.log(`   测试用例: ${testCases.length} 个\n`);

  const results: Array<{
    id: string;
    group: string;
    title: string;
    hitCardIds: string[];
    hitCheckPassed: boolean;
    hitCheckDetails: string;
    answer?: string;
    contentCheckPassed?: boolean;
    contentCheckDetails?: string;
    hardFail?: boolean;
    tokens?: number;
  }> = [];

  let hitPassed = 0;
  let contentPassed = 0;
  let hardFails = 0;
  let totalTokens = 0;

  for (const tc of testCases) {
    process.stdout.write(`  [${tc.id}] ${tc.title}... `);

    // 1. 知识卡命中检测
    const cards = await searchKnowledgeCards('lydia', tc.userInput);
    const hitIds = cards.map((c) => c.cardId);
    const hitCheck = checkHitCards(hitIds, tc.expected);

    const result: any = {
      id: tc.id,
      group: tc.group,
      title: tc.title,
      hitCardIds: hitIds,
      hitCheckPassed: hitCheck.passed,
      hitCheckDetails: hitCheck.details,
    };

    if (hitCheck.passed) hitPassed++;

    // 2. LLM 回答检测
    if (!dryRun) {
      const cardsText = formatKnowledgeCards(cards);
      const systemPrompt = assembleSystemPrompt({
        mentorName: mentor.name,
        mentorProfilePublic: mentor.publicProfile || mentor.tagline,
        userProfileConfirmed: '暂无',
        userProfileInferred: '',
        assessmentContext: '',
        conversationSummary: '',
        currentTime: new Date().toISOString(),
        retrievedCardsText: cardsText,
        persona: mentor.personalityPrompt,
      });

      const { content, tokens } = await callLLM(systemPrompt, tc.userInput);
      totalTokens += tokens;

      const contentCheck = checkContent(content, tc.expected);
      result.answer = content.slice(0, 500);
      result.contentCheckPassed = contentCheck.passed;
      result.contentCheckDetails = contentCheck.details;
      result.hardFail = contentCheck.hardFail;
      result.tokens = tokens;

      if (contentCheck.passed) contentPassed++;
      if (contentCheck.hardFail) hardFails++;
    }

    results.push(result);

    const status = hitCheck.passed ? '✅' : '❌';
    const contentStatus = dryRun ? '' : result.contentCheckPassed ? '✅' : '❌';
    console.log(`${status} 命中${dryRun ? '' : ` / ${contentStatus} 内容`}`);
    if (!hitCheck.passed) console.log(`       命中: ${hitCheck.details}`);
    if (!dryRun && !result.contentCheckPassed) {
      console.log(`       内容: ${result.contentCheckDetails}`);
    }
  }

  // ===== 汇总 =====
  console.log('\n📊 结果汇总');
  console.log(`   命中检测: ${hitPassed}/${testCases.length} 通过`);
  if (!dryRun) {
    console.log(`   内容检测: ${contentPassed}/${testCases.length} 通过`);
    console.log(`   硬伤: ${hardFails}`);
    console.log(`   总 token: ${totalTokens}`);
  }

  // 保存结果
  const resultsDir = resolve(process.cwd(), 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = join(resultsDir, `acceptance-v0.6.2-${timestamp}.json`);
  writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n💾 详细结果已保存: ${outFile}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 验收测试失败:', e.message || e);
  process.exit(1);
});
