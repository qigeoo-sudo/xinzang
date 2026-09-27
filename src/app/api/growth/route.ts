import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { mentors } from '@/lib/mentors';

// 水果清单（与 public/fruits/index.json 一致）
const FRUITS = [
  { zh: '苹果', en: 'apple' }, { zh: '香蕉', en: 'banana' }, { zh: '橘子', en: 'mandarin' },
  { zh: '西瓜', en: 'watermelon' }, { zh: '橙子', en: 'orange' }, { zh: '梨', en: 'pear' },
  { zh: '葡萄', en: 'grape' }, { zh: '甜瓜', en: 'melon' }, { zh: '哈密瓜', en: 'hami-melon' },
  { zh: '猕猴桃', en: 'kiwi' }, { zh: '芒果', en: 'mango' }, { zh: '火龙果', en: 'dragon-fruit' },
  { zh: '菠萝', en: 'pineapple' }, { zh: '桃子', en: 'peach' }, { zh: '李子', en: 'plum' },
  { zh: '冬枣', en: 'winter-jujube' }, { zh: '草莓', en: 'strawberry' }, { zh: '柚子', en: 'pomelo' },
  { zh: '荔枝', en: 'lychee' }, { zh: '龙眼', en: 'longan' }, { zh: '樱桃', en: 'cherry' },
  { zh: '柿子', en: 'persimmon' }, { zh: '石榴', en: 'pomegranate' }, { zh: '杨梅', en: 'bayberry' },
  { zh: '椰子', en: 'coconut' }, { zh: '山楂', en: 'hawthorn' }, { zh: '蓝莓', en: 'blueberry' },
  { zh: '柠檬', en: 'lemon' }, { zh: '牛油果', en: 'avocado' }, { zh: '金桔', en: 'kumquat' },
  { zh: '葡萄柚', en: 'grapefruit' }, { zh: '油桃', en: 'nectarine' }, { zh: '百香果', en: 'passion-fruit' },
  { zh: '番石榴', en: 'guava' }, { zh: '木瓜', en: 'papaya' }, { zh: '青柠', en: 'lime' },
  { zh: '榴莲', en: 'durian' }, { zh: '枇杷', en: 'loquat' }, { zh: '杏', en: 'apricot' },
  { zh: '无花果', en: 'fig' }, { zh: '山竹', en: 'mangosteen' }, { zh: '红毛丹', en: 'rambutan' },
  { zh: '桑葚', en: 'mulberry' }, { zh: '菠萝蜜', en: 'jackfruit' }, { zh: '树莓', en: 'raspberry' },
  { zh: '黑莓', en: 'blackberry' }, { zh: '莲雾', en: 'wax-apple' }, { zh: '释迦果', en: 'custard-apple' },
  { zh: '橄榄', en: 'olive' }, { zh: '海棠果', en: 'crabapple' }, { zh: '杨桃', en: 'carambola' },
  { zh: '雪莲果', en: 'yacón' }, { zh: '酸浆', en: 'physalis' }, { zh: '余甘子', en: 'phyllanthus' },
  { zh: '蔓越莓', en: 'cranberry' }, { zh: '沙棘', en: 'sea-buckthorn' }, { zh: '刺梨', en: 'cili' },
  { zh: '醋栗', en: 'gooseberry' }, { zh: '黑加仑', en: 'blackcurrant' }, { zh: '红加仑', en: 'redcurrant' },
  { zh: '刺角瓜', en: 'kiwano' }, { zh: '蛋黄果', en: 'canistel' }, { zh: '椰枣', en: 'date-palm' },
  { zh: '蛇皮果', en: 'salak' }, { zh: '酸豆', en: 'tamarind' }, { zh: '龙宫果', en: 'langsat' },
  { zh: '八月瓜', en: 'august-melon' }, { zh: '人心果', en: 'sapodilla' }, { zh: '佛手', en: 'buddha-hand' },
  { zh: '拐枣', en: 'hovenia' }, { zh: '指橙', en: 'finger-lime' }, { zh: '嘉宝果', en: 'jabuticaba' },
  { zh: '神秘果', en: 'miracle-fruit' }, { zh: '黄晶果', en: 'abiu' }, { zh: '巴西莓', en: 'acai' },
  { zh: '诺丽果', en: 'noni' }, { zh: '刺番荔枝', en: 'soursop' }, { zh: '木奶果', en: 'bacuri' },
  { zh: '星苹果', en: 'star-apple' }, { zh: '面包果', en: 'breadfruit' }, { zh: '香肉果', en: 'ambarella' },
  { zh: '马米果', en: 'mamey' }, { zh: '猫屎瓜', en: 'akebia' }, { zh: '蒲桃', en: 'rose-apple' },
  { zh: '桃金娘', en: 'myrtle' }, { zh: '露兜果', en: 'pandanus' }, { zh: '猴面包果', en: 'baobab' },
  { zh: '费约果', en: 'feijoa' }, { zh: '火棘果', en: 'pyracantha' }, { zh: '胡颓子', en: 'elaeagnus' },
  { zh: '金樱子', en: 'rosa-roxburghii' }, { zh: '卡卡杜李', en: 'kakadu-plum' }, { zh: '卡姆果', en: 'camu-camu' },
  { zh: '木苹果', en: 'bael' }, { zh: '地菍', en: 'gynura' }, { zh: '巴婆果', en: 'pawpaw' },
  { zh: '鲑鱼莓', en: 'salmonberry' }, { zh: '野樱莓', en: 'aronia' }, { zh: '云莓', en: 'cloudberry' },
  { zh: '锡兰橄榄', en: 'ceylon-olive' },
];

// 前 100 个素数（从 2 开始）
function firstNPrimes(n: number): number[] {
  const primes: number[] = [];
  let candidate = 2;
  while (primes.length < n) {
    let isPrime = true;
    for (const p of primes) {
      if (p * p > candidate) break;
      if (candidate % p === 0) { isPrime = false; break; }
    }
    if (isPrime) primes.push(candidate);
    candidate++;
  }
  return primes;
}

// 开发环境未登录时返回的示例数据，供 /dashboard 预览
// previewCount: 传入对话轮次，>=600 则 100 个水果全部解锁
function buildMockData(previewCount?: number) {
  const primes = firstNPrimes(100);
  const validConversationCount = previewCount ?? 221;
  const currentPrimeIndex = primes.findIndex((p) => p > validConversationCount);
  const unlocked = currentPrimeIndex === -1 ? 100 : currentPrimeIndex;
  const now = new Date();
  const a = (days: number, h = 10, m = 0) => {
    const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(h, m, 0, 0); return d.toISOString();
  };
  return {
    registeredAt: a(30),
    loginCount: 46,
    mentorCount: 4,
    topMentors: [
      { id: 'lydiachen', name: 'Lydia Chen', messageCount: 92 },
      { id: 'alexzhou', name: 'Alex Zhou', messageCount: 76 },
      { id: 'mayzhang', name: 'Maya Zhang', messageCount: 53 },
    ],
    totalMessages: 448,
    validConversationCount,
    unlockedCount: unlocked,
    primes,
    fruits: FRUITS,
    // 第 N 次对话对应的导师名（第 N 次对话 = 第 N 条用户消息）
    mentorNames: Array.from({ length: 60 }, (_, i) => ['Lydia Chen', 'Alex Zhou', 'Maya Zhang'][i % 3]),
    milestones: [
      { id: 'm1', sessionId: 'demo', type: 'mini', atCount: 5, mentorName: 'Lydia 陈', content: '你聊到了想转行做产品，开始拆解过往经验和产品的匹配点。', createdAt: a(25) },
      { id: 'm2', sessionId: 'demo', type: 'mini', atCount: 10, mentorName: 'Lydia 陈', content: '你梳理了三个可迁移能力，定下了两周内打磨作品集的计划。', createdAt: a(20) },
      { id: 'm3', sessionId: 'demo', type: 'major', atCount: 15, mentorName: 'Lydia 陈', content: '从转行困惑到明确产品方向：你完成了能力盘点、作品集框架与目标公司清单，下一步是投递与模拟面试。', createdAt: a(15) },
      { id: 'm4', sessionId: 'demo', type: 'mini', atCount: 20, mentorName: 'Alex 周', content: '你开始准备简历，讨论如何量化过往项目成果。', createdAt: a(10) },
    ],
    sessions: [],
  };
}

export async function GET(req: Request) {
  // 预览开关：/dashboard?preview=221 时（仅开发环境）跳过登录态，强制返回 221 轮示例场景
  const preview = new URL(req.url).searchParams.get('preview');
  if (preview && process.env.NODE_ENV === 'development') {
    return NextResponse.json(buildMockData(Number(preview) || undefined));
  }
  const session = await auth();
  if (!session?.user?.id) {
    // 生产环境未登录拒绝；开发环境返回示例数据方便预览
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(buildMockData());
  }

  const userId = session.user.id;

  // 并行查询
  const [user, chatSessions, totalMessages, userMessageCount, perSessionUserMsg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, loginCount: true },
    }),
    prisma.chatSession.findMany({
      where: { userId },
      select: {
        id: true,
        mentorId: true,
        messageCount: true,
        summary: true,
        summaryMessageCount: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.chatMessage.count({
      where: { chatSession: { userId } },
    }),
    // 有效对话次数 = 用户发起的消息数（对话轮次）
    prisma.chatMessage.count({
      where: { chatSession: { userId }, role: 'user' },
    }),
    // 每个会话的用户消息数（展开「第 N 次对话」用）
    prisma.chatMessage.groupBy({
      by: ['chatSessionId'],
      where: { chatSession: { userId }, role: 'user' },
      _count: { _all: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // 导师映射
  const mentorMap = new Map(mentors.map((m) => [m.id, m.name]));

  // 聊过的导师数
  const mentorIds = new Set(chatSessions.map((s) => s.mentorId));
  const mentorCount = mentorIds.size;

  // 前三位聊得最多的导师（按 messageCount 聚合）
  const mentorMessageCount = new Map<string, number>();
  for (const s of chatSessions) {
    mentorMessageCount.set(s.mentorId, (mentorMessageCount.get(s.mentorId) || 0) + s.messageCount);
  }
  const topMentors = Array.from(mentorMessageCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({ id, name: mentorMap.get(id) || id, messageCount: count }));

  // 有效对话次数 = 用户发起的对话轮次（role=user 的消息数）
  const validSessions = chatSessions.filter((s) => s.messageCount > 0);
  const validConversationCount = userMessageCount;

  // 榨职进度：素数节点
  const primes = firstNPrimes(100);
  const currentPrimeIndex = primes.findIndex((p) => p > validConversationCount);
  const unlockedCount = currentPrimeIndex === -1 ? 100 : currentPrimeIndex;

  // 对话回顾里程碑（小结/总结）时间线
  const milestonesRaw = await prisma.chatMilestone.findMany({
    where: { session: { userId } },
    orderBy: { createdAt: 'asc' },
  });
  // 需要会话 id → mentor 映射
  const sessionMentor = new Map(chatSessions.map((s) => [s.id, s.mentorId]));
  // 只保留每位导师的最新一张总结（atCount 最大的 major）和最新一张小结（atCount 最大的 mini），
  // 旧的整十总结与旧场小结不再展示
  const latestByKey = new Map<string, (typeof milestonesRaw)[number]>();
  for (const m of milestonesRaw) {
    const key = `${sessionMentor.get(m.sessionId) || ''}-${m.type}`;
    const cur = latestByKey.get(key);
    if (!cur || m.atCount > cur.atCount) latestByKey.set(key, m);
  }
  const milestones = [...latestByKey.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // 最新在前
    .map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      type: m.type,
      atCount: m.atCount,
      content: m.content,
      mentorName: mentorMap.get(sessionMentor.get(m.sessionId) || '') || m.sessionId,
      createdAt: m.createdAt.toISOString(),
    }));

  // 有效会话 id 列表（供前端触发补生成）
  const sessions = validSessions.map((s) => ({ id: s.id }));

  // 第 N 次对话 → 导师名：会话按创建时间正序，展开每条用户消息对应的导师
  const userCountBySession = new Map(
    perSessionUserMsg.map((g) => [g.chatSessionId, g._count?._all ?? 0]),
  );
  const orderedSessions = [...chatSessions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const mentorNames: string[] = [];
  for (const s of orderedSessions) {
    const n = userCountBySession.get(s.id) || 0;
    const name = mentorMap.get(s.mentorId) || s.mentorId;
    for (let k = 0; k < n && mentorNames.length < 100; k++) mentorNames.push(name);
  }

  return NextResponse.json({
    registeredAt: user.createdAt.toISOString(),
    loginCount: user.loginCount,
    mentorCount,
    topMentors,
    totalMessages,
    validConversationCount,
    unlockedCount,
    primes,
    fruits: FRUITS,
    mentorNames,
    milestones,
    sessions,
  });
}
