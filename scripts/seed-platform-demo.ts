/**
 * 平台级演示数据种子 — 为 20 位导师分身生成科学分布的浏览/对话/订阅/反馈数据
 * 仅用于本地开发测试。
 *   npx tsx scripts/seed-platform-demo.ts
 */
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  CAREER_OPTIONS,
  HELP_PRIORITY_OPTIONS,
  MENTOR_PREFERENCE_OPTIONS,
} from '../src/lib/register-options';

const NOW = new Date();
const DAY_MS = 24 * 3600_000;
const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const LAUNCH_DAYS = 75; // 从 75 天前开始上线

const pastDate = (daysAgo: number) => new Date(today.getTime() - daysAgo * DAY_MS);

// 样本数据池
const FIRST_NAMES = ['张', '李', '王', '赵', '陈', '刘', '杨', '黄', '吴', '周', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
const MAJORS = ['计算机科学', '金融学', '心理学', '机械工程', '新闻传播', '工商管理', '设计学', '法学', '医学', '教育学', '电子工程', '建筑学'];
const PROVINCES = ['上海', '北京', '广东', '浙江', '江苏', '四川', '湖北', '湖南', '福建', '山东', '河南', '陕西'];
const STATUSES = ['在校', '在职', '待业'];
const RIASEC_CODES = ['R', 'I', 'A', 'S', 'E', 'C'];
const REPORT_REASONS = ['OFFENSIVE', 'OFF_TOPIC', 'HALLUCINATION', 'REPETITIVE', 'OTHER'] as const;

const ANXIETY_TEXTS = [
  '快毕业了，不知道自己适合什么工作，对未来很迷茫',
  '本科学的东西很杂，感觉什么都懂一点又什么都不精，担心找不到好工作',
  '秋招投了很多简历都没有回应，开始怀疑自己的能力',
  '拿到两个 offer，一个大公司工资低，一个小公司给钱多，不知道怎么选',
  '工作两年了，每天做重复的事，看不到成长空间，想转行又怕从零开始',
  '家里人希望我考公务员，但我想去企业闯一闯，两边都有压力',
  '面试总是紧张，一到 HR 面就发挥不好，很多问题答不上来',
  '不知道自己喜欢什么，对职业没有规划，走一步看一步但又很焦虑',
  '跨专业找工作没有相关经验，简历都过不了筛选，很受挫',
  '同学都拿到大厂 offer 了，我还没着落，晚上经常失眠',
  '现在的岗位钱少事多，想跳槽但大环境不好，怕越跳越差',
  '实习做的都是打杂的活，学不到东西，担心转正无望',
];

const SUBSCRIPTION_PLANS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
type Plan = typeof SUBSCRIPTION_PLANS[number];
type Purchase = { type: 'SUBSCRIPTION'; plan: Plan } | { type: 'CREDIT_PACK' };

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pickN<T>(arr: T[], n: number): T[] { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function randBool(p = 0.5) { return Math.random() < p; }

async function hash(pwd: string) { return bcrypt.hash(pwd, 12); }

/** 加权日期偏移：近期多、远期少，呈自然增长曲线 */
function weightedDayOffset(): number {
  const r = Math.random();
  if (r < 0.40) return randInt(0, 6);
  if (r < 0.70) return randInt(7, 21);
  if (r < 0.90) return randInt(22, 45);
  return randInt(46, LAUNCH_DAYS - 1);
}

// 20 位导师（前 8 位来自 mentors.ts 配置，后 12 位为补充）
const MENTORS: Array<{ id: string; name: string; tier: 'S' | 'A' | 'B' | 'C' }> = [
  { id: 'lydiachen', name: 'Lydia Chen', tier: 'S' },
  { id: 'winnieni', name: 'Winnie Ni', tier: 'A' },
  { id: 'tinazhang', name: 'Tina Zhang', tier: 'A' },
  { id: 'freyagao', name: 'Freya Gao', tier: 'A' },
  { id: 'phyllischi', name: 'Phyllis Chi', tier: 'B' },
  { id: 'freyaren', name: 'Freya Ren', tier: 'B' },
  { id: 'yingwang', name: 'Ying Wang', tier: 'B' },
  { id: 'kevinyuan', name: 'Kevin Yuan', tier: 'B' },
  { id: 'sophialiu', name: 'Sophia Liu', tier: 'B' },
  { id: 'emilychen', name: 'Emily Chen', tier: 'B' },
  { id: 'oliviawu', name: 'Olivia Wu', tier: 'C' },
  { id: 'ameliazhao', name: 'Amelia Zhao', tier: 'C' },
  { id: 'isabellali', name: 'Isabella Li', tier: 'C' },
  { id: 'chloewang', name: 'Chloe Wang', tier: 'C' },
  { id: 'miasun', name: 'Mia Sun', tier: 'C' },
  { id: 'lucyzheng', name: 'Lucy Zheng', tier: 'C' },
  { id: 'gracexu', name: 'Grace Xu', tier: 'C' },
  { id: 'lilyhuang', name: 'Lily Huang', tier: 'C' },
  { id: 'annzhou', name: 'Ann Zhou', tier: 'C' },
  { id: 'helenma', name: 'Helen Ma', tier: 'C' },
];

const TIER_CONFIG: Record<string, { users: number; subs: number; packs: number; sessRange: [number, number]; profileOnly: number; impressionOnly: number; knowledgeCards: number; caseCards: number }> = {
  S: { users: 440, subs: 179, packs: 34, sessRange: [1, 4], profileOnly: 200, impressionOnly: 210, knowledgeCards: 60, caseCards: 18 },
  A: { users: 130, subs: 42, packs: 8, sessRange: [1, 3], profileOnly: 55, impressionOnly: 60, knowledgeCards: 40, caseCards: 12 },
  B: { users: 65, subs: 18, packs: 4, sessRange: [1, 3], profileOnly: 28, impressionOnly: 30, knowledgeCards: 25, caseCards: 7 },
  C: { users: 32, subs: 8, packs: 2, sessRange: [1, 2], profileOnly: 14, impressionOnly: 15, knowledgeCards: 15, caseCards: 4 },
};

/** 为某位导师生成完整数据 */
async function seedMentor(mentorId: string, mentorName: string, tier: string, mentorIdx: number) {
  const cfg = TIER_CONFIG[tier];
  const launchDate = pastDate(LAUNCH_DAYS - 1);

  // 确保导师账号存在
  const mentorUser = await prisma.user.findFirst({ where: { boundMentorId: mentorId } });
  if (!mentorUser) {
    const phone = `138${String(10000000 + Math.floor(Math.random() * 90000000)).slice(0, 8)}`;
    await prisma.user.create({
      data: {
        phone,
        passwordHash: await hash('mentor1234'),
        name: mentorName,
        role: 'MENTOR_HUMAN',
        userGroup: 'MENTOR',
        boundMentorId: mentorId,
        createdAt: launchDate,
      },
    });
    console.log(`  创建导师账号: ${mentorName} (${mentorId})`);
  } else {
    // 更新创建时间到上线日
    await prisma.user.update({ where: { id: mentorUser.id }, data: { createdAt: launchDate } });
  }

  // 清理该导师旧数据
  await prisma.dailyMentorStats.deleteMany({ where: { mentorId } });
  await prisma.mentorKnowledgeCard.deleteMany({ where: { mentorId } });
  const oldSessions = await prisma.chatSession.findMany({ where: { mentorId }, select: { id: true, userId: true } });
  const oldUserIds = [...new Set(oldSessions.map((s) => s.userId))];
  if (oldSessions.length > 0) {
    await prisma.chatMessage.deleteMany({ where: { chatSessionId: { in: oldSessions.map((s) => s.id) } } });
  }
  await prisma.chatSession.deleteMany({ where: { mentorId } });
  await prisma.messageFeedback.deleteMany({ where: { mentorId } });
  await prisma.event.deleteMany({ where: { props: { contains: mentorId } } });
  if (oldUserIds.length > 0) {
    await prisma.subscription.deleteMany({ where: { userId: { in: oldUserIds } } });
    await prisma.paymentOrder.deleteMany({ where: { userId: { in: oldUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: oldUserIds } } });
  }

  // 生成用户（对话用户 + 只看主页 + 只看卡片，漏斗递减）
  const phonePrefix = `199${String(mentorIdx).padStart(2, '0')}`;
  const totalUsers = cfg.users + cfg.profileOnly + cfg.impressionOnly;
  const allUsers: Array<{ id: string; phone: string }> = [];
  for (let i = 0; i < totalUsers; i++) {
    const phone = `${phonePrefix}${String(i).padStart(7, '0')}`;
    const birthYear = randInt(1995, 2004);
    const birthMonth = `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}`;
    const careerValues = pickN(CAREER_OPTIONS.map((o) => o.value), randInt(2, 4));
    const helpValue = rand(HELP_PRIORITY_OPTIONS).value;
    const mentorPrefs = pickN(MENTOR_PREFERENCE_OPTIONS.map((o) => o.value), randInt(2, 3));
    const riasec = rand(RIASEC_CODES) + rand(RIASEC_CODES) + rand(RIASEC_CODES);

    await prisma.user.create({
      data: {
        phone,
        passwordHash: await hash('demo1234'),
        name: `${rand(FIRST_NAMES)}${String.fromCharCode(0x4e00 + Math.floor(Math.random() * 2000))}`,
        role: 'USER',
        userGroup: 'NORMAL',
        freeTrialUsed: 0,
        createdAt: pastDate(weightedDayOffset()),
        profile: {
          create: {
            nickname: `用户${i + 1}`,
            status: rand(STATUSES),
            birthMonth,
            major: rand(MAJORS),
            curProvince: rand(PROVINCES),
            workProvince: rand(PROVINCES),
            careers: JSON.stringify(careerValues),
            helpPriority: JSON.stringify([helpValue]),
            mentorPreference: JSON.stringify(mentorPrefs),
            careerAnxiety: rand(ANXIETY_TEXTS),
          },
        },
        interestAssessment: {
          create: {
            scores: JSON.stringify({ R: randInt(30, 80), I: randInt(30, 80), A: randInt(30, 80), S: randInt(30, 80), E: randInt(30, 80), C: randInt(30, 80) }),
            answers: '[]',
            questionVersion: 'v2',
            code: riasec,
          },
        },
      },
    });
  }
  // 取回用户 ID 并按创建顺序分三组
  const createdUsers = await prisma.user.findMany({
    where: { phone: { startsWith: phonePrefix } },
    select: { id: true, phone: true },
    orderBy: { phone: 'asc' },
  });
  for (const u of createdUsers) allUsers.push(u);
  const chatUsers = allUsers.slice(0, cfg.users);
  const profileOnlyUsers = allUsers.slice(cfg.users, cfg.users + cfg.profileOnly);
  const impressionOnlyUsers = allUsers.slice(cfg.users + cfg.profileOnly);
  console.log(`  对话用户: ${chatUsers.length}, 只看主页: ${profileOnlyUsers.length}, 只看卡片: ${impressionOnlyUsers.length}`);

  // 决定每个对话用户的购买计划（精确控制订阅/加榨包用户数）
  const userPurchases = new Map<string, Purchase[]>();
  const shuffled = [...chatUsers].sort(() => Math.random() - 0.5);
  const subUsers = shuffled.slice(0, cfg.subs);
  const packUsers = shuffled.slice(cfg.subs, cfg.subs + cfg.packs);
  const subUserSet = new Set(subUsers.map((u) => u.id));
  const packUserSet = new Set(packUsers.map((u) => u.id));

  for (const u of chatUsers) {
    const purchases: Purchase[] = [];
    const hasSub = subUserSet.has(u.id);
    const hasPack = packUserSet.has(u.id);
    if (hasSub) {
      // 订阅用户：1-2 笔订阅（模拟续费/升级）
      const subCount = randBool(0.85) ? 1 : 2;
      for (let p = 0; p < subCount; p++) {
        purchases.push({ type: 'SUBSCRIPTION', plan: rand(SUBSCRIPTION_PLANS) });
      }
    }
    if (hasPack) {
      // 加榨包用户：1-2 个包
      const packCount = randBool(0.7) ? 1 : 2;
      for (let p = 0; p < packCount; p++) {
        purchases.push({ type: 'CREDIT_PACK' });
      }
    }
    userPurchases.set(u.id, purchases);
  }

  // 创建会话 + 消息
  const sessions: Array<{ id: string; userId: string }> = [];
  const messageRows: Array<{ chatSessionId: string; role: string; content: string; createdAt: Date; entitlementSource: string | null }> = [];
  const firstCompleted = new Map<string, number>(); // userId -> 最早完成时间

  for (const u of chatUsers) {
    const purchases = userPurchases.get(u.id) ?? [];
    const sessionCount = 1 + purchases.length; // 1 免费 + N 付费
    for (let s = 0; s < sessionCount; s++) {
      const createdAt = pastDate(weightedDayOffset());
      const sess = await prisma.chatSession.create({
        data: { userId: u.id, mentorId, title: `会话${s + 1}`, createdAt },
      });
      sessions.push({ id: sess.id, userId: u.id });

      let sessionSource: string;
      if (s === 0) {
        sessionSource = 'FREE_TRIAL';
      } else {
        const p = purchases[s - 1];
        if (p.type === 'SUBSCRIPTION') {
          sessionSource = p.plan === 'MONTHLY' ? 'SUBSCRIPTION_MONTHLY'
            : p.plan === 'QUARTERLY' ? 'SUBSCRIPTION_QUARTERLY'
            : 'SUBSCRIPTION_YEARLY';
        } else {
          sessionSource = 'CREDIT_PACK';
        }
      }

      const rounds = randInt(3, 8);
      for (let r = 0; r < rounds; r++) {
        const msgTime = new Date(createdAt.getTime() + r * 60000 + Math.random() * 30000);
        messageRows.push({ chatSessionId: sess.id, role: 'user', content: `第${r + 1}轮用户问题`, createdAt: msgTime, entitlementSource: null });
        const assistTime = new Date(msgTime.getTime() + 5000);
        messageRows.push({ chatSessionId: sess.id, role: 'assistant', content: `第${r + 1}轮导师回复`, createdAt: assistTime, entitlementSource: sessionSource });
        // 累计帮助用户：记录最早完成轮次时间
        const completedSrc = sessionSource === 'FREE_TRIAL' || sessionSource === 'CREDIT_PACK' || sessionSource.startsWith('SUBSCRIPTION');
        if (completedSrc) {
          const prev = firstCompleted.get(u.id);
          if (prev === undefined || assistTime.getTime() < prev) firstCompleted.set(u.id, assistTime.getTime());
        }
      }
    }
  }

  // 批量写入消息
  await prisma.chatMessage.createMany({ data: messageRows });
  console.log(`  会话: ${sessions.length} 条, 消息: ${messageRows.length} 条`);

  // 反馈（采样 20% 的 assistant 消息）
  const assistMsgs = await prisma.chatMessage.findMany({
    where: { chatSessionId: { in: sessions.map((s) => s.id) }, role: 'assistant' },
    select: { id: true, createdAt: true, chatSessionId: true },
  });
  const sessionUserMap = new Map(sessions.map((s) => [s.id, s.userId]));
  const feedbackTypes: Array<'LIKE' | 'DISLIKE' | 'REPORT'> = ['LIKE', 'LIKE', 'LIKE', 'DISLIKE', 'REPORT'];
  const feedbackRows: Array<{ messageId: string; userId: string; mentorId: string; feedbackType: 'LIKE' | 'DISLIKE' | 'REPORT'; reportReason: string | null; createdAt: Date }> = [];
  const shuffledAssist = [...assistMsgs].sort(() => Math.random() - 0.5);
  const feedbackCount = Math.floor(assistMsgs.length * 0.2);
  for (let i = 0; i < feedbackCount; i++) {
    const msg = shuffledAssist[i];
    const ft = rand(feedbackTypes);
    feedbackRows.push({
      messageId: msg.id,
      userId: sessionUserMap.get(msg.chatSessionId)!,
      mentorId,
      feedbackType: ft,
      reportReason: ft === 'REPORT' ? rand(REPORT_REASONS) : null,
      createdAt: msg.createdAt,
    });
  }
  if (feedbackRows.length > 0) {
    await prisma.messageFeedback.createMany({ data: feedbackRows });
  }
  console.log(`  反馈: ${feedbackRows.length} 条`);

  // 浏览事件：三组用户行为不同，形成曝光→主页→对话的漏斗
  const eventRows: Array<{ eventId: string; eventName: string; userId: string; userGroupSnapshot: string; page: string; target: string; props: string; clientTs: Date }> = [];
  // 对话用户：1-3 次曝光，0-2 次主页访问
  for (const u of chatUsers) {
    for (let e = 0; e < randInt(1, 3); e++) {
      eventRows.push({ eventId: crypto.randomUUID(), eventName: 'mentor_card.impression', userId: u.id, userGroupSnapshot: 'NORMAL', page: '/mentors', target: `mentor-card-${mentorId}`, props: JSON.stringify({ mentorId }), clientTs: pastDate(weightedDayOffset()) });
    }
    for (let e = 0; e < randInt(0, 2); e++) {
      eventRows.push({ eventId: crypto.randomUUID(), eventName: 'mentor_profile.view', userId: u.id, userGroupSnapshot: 'NORMAL', page: `/mentors/${mentorId}`, target: `mentor-profile-${mentorId}`, props: JSON.stringify({ mentorId }), clientTs: pastDate(weightedDayOffset()) });
    }
  }
  // 只看主页用户：1-3 次曝光，1-2 次主页访问（不点对话）
  for (const u of profileOnlyUsers) {
    for (let e = 0; e < randInt(1, 3); e++) {
      eventRows.push({ eventId: crypto.randomUUID(), eventName: 'mentor_card.impression', userId: u.id, userGroupSnapshot: 'NORMAL', page: '/mentors', target: `mentor-card-${mentorId}`, props: JSON.stringify({ mentorId }), clientTs: pastDate(weightedDayOffset()) });
    }
    for (let e = 0; e < randInt(1, 2); e++) {
      eventRows.push({ eventId: crypto.randomUUID(), eventName: 'mentor_profile.view', userId: u.id, userGroupSnapshot: 'NORMAL', page: `/mentors/${mentorId}`, target: `mentor-profile-${mentorId}`, props: JSON.stringify({ mentorId }), clientTs: pastDate(weightedDayOffset()) });
    }
  }
  // 只看卡片用户：1-2 次曝光，不进主页
  for (const u of impressionOnlyUsers) {
    for (let e = 0; e < randInt(1, 2); e++) {
      eventRows.push({ eventId: crypto.randomUUID(), eventName: 'mentor_card.impression', userId: u.id, userGroupSnapshot: 'NORMAL', page: '/mentors', target: `mentor-card-${mentorId}`, props: JSON.stringify({ mentorId }), clientTs: pastDate(weightedDayOffset()) });
    }
  }
  await prisma.event.createMany({ data: eventRows });
  console.log(`  事件: ${eventRows.length} 条`);

  // 订单 + 订阅（仅对话用户）
  const orderRows: Array<{ userId: string; orderNo: string; status: string; paymentType: string; amount: number; paidAt: Date; createdAt: Date }> = [];
  const subRows: Array<{ userId: string; plan: string; status: string; startDate: Date; endDate: Date; orderNo: string }> = [];
  for (const u of chatUsers) {
    const purchases = userPurchases.get(u.id) ?? [];
    for (let p = 0; p < purchases.length; p++) {
      const orderNo = `DEMO_${mentorId}_${u.id.slice(-6)}_${p}_${Date.now()}`;
      const createdAt = pastDate(weightedDayOffset());
      const purchase = purchases[p];
      if (purchase.type === 'SUBSCRIPTION') {
        const plan = purchase.plan;
        const amount = plan === 'MONTHLY' ? 59 : plan === 'QUARTERLY' ? 169 : 599;
        const duration = plan === 'MONTHLY' ? 30 : plan === 'QUARTERLY' ? 90 : 365;
        orderRows.push({ userId: u.id, orderNo, status: 'PAID', paymentType: 'SUBSCRIPTION', amount, paidAt: createdAt, createdAt });
        subRows.push({ userId: u.id, plan, status: 'ACTIVE', startDate: createdAt, endDate: new Date(createdAt.getTime() + duration * DAY_MS), orderNo });
      } else {
        orderRows.push({ userId: u.id, orderNo, status: 'PAID', paymentType: 'CREDIT_PACK', amount: randBool(0.5) ? 29 : 99, paidAt: createdAt, createdAt });
      }
    }
  }
  if (orderRows.length > 0) {
    await prisma.paymentOrder.createMany({ data: orderRows });
    // 取回订单 ID 用于订阅关联
    const orderNos = orderRows.map((o) => o.orderNo);
    const createdOrders = await prisma.paymentOrder.findMany({
      where: { orderNo: { in: orderNos } },
      select: { id: true, orderNo: true },
    });
    const orderIdMap = new Map(createdOrders.map((o) => [o.orderNo, o.id]));
    if (subRows.length > 0) {
      await prisma.subscription.createMany({
        data: subRows.map((s) => {
          const { orderNo, ...rest } = s;
          return { ...rest, paymentOrderId: orderIdMap.get(orderNo)! };
        }),
      });
    }
  }
  const subUserCount = subUsers.length;
  const packUserCount = packUsers.length;
  console.log(`  订阅用户: ${subUserCount}, 加榨包用户: ${packUserCount}, 订单: ${orderRows.length}`);

  // DailyMentorStats 日汇总
  const bjDayStartMs = (t: Date) => {
    const shifted = t.getTime() + 8 * 3600_000;
    return Math.floor(shifted / DAY_MS) * DAY_MS - 8 * 3600_000;
  };
  const isCompletedSrc = (src: string | null) => src === 'FREE_TRIAL' || src === 'CREDIT_PACK' || src?.startsWith('SUBSCRIPTION');
  const isBilledSrc = (src: string | null) => src === 'CREDIT_PACK' || src?.startsWith('SUBSCRIPTION');

  interface DayBucket {
    completed: number; billed: number; free: number; nonBilling: number;
    impression: number; profileView: number; like: number; dislike: number; report: number;
  }
  const emptyBucket = (): DayBucket => ({ completed: 0, billed: 0, free: 0, nonBilling: 0, impression: 0, profileView: 0, like: 0, dislike: 0, report: 0 });
  const buckets = new Map<number, DayBucket>();
  const getBucket = (ms: number) => { const b = buckets.get(ms) ?? emptyBucket(); buckets.set(ms, b); return b; };

  for (const m of messageRows) {
    if (m.role !== 'assistant') continue;
    const b = getBucket(bjDayStartMs(m.createdAt));
    if (isCompletedSrc(m.entitlementSource)) b.completed++;
    if (isBilledSrc(m.entitlementSource)) b.billed++;
    if (m.entitlementSource === 'FREE_TRIAL') b.free++;
    if (m.entitlementSource === 'NON_BILLING') b.nonBilling++;
  }
  for (const e of eventRows) {
    const b = getBucket(bjDayStartMs(e.clientTs));
    if (e.eventName === 'mentor_card.impression') b.impression++;
    if (e.eventName === 'mentor_profile.view') b.profileView++;
  }
  for (const f of feedbackRows) {
    const b = getBucket(bjDayStartMs(f.createdAt));
    if (f.feedbackType === 'LIKE') b.like++;
    else if (f.feedbackType === 'DISLIKE') b.dislike++;
    else b.report++;
  }

  // 按日落库
  const statRows: Array<{ date: Date; mentorId: string; metricKey: string; valueInt: number; aggregationVersion: string }> = [];
  for (let d = 0; d < LAUNCH_DAYS; d++) {
    const dayMs = bjDayStartMs(pastDate(d));
    const dateObj = new Date(dayMs);
    const dayEndMs = dayMs + DAY_MS;
    const b = buckets.get(dayMs) ?? emptyBucket();
    let helped = 0;
    for (const t of firstCompleted.values()) if (t < dayEndMs) helped++;

    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.completed_qa_rounds', valueInt: b.completed, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.billed_rounds', valueInt: b.billed, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.free_trial_rounds', valueInt: b.free, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.non_billing_replies', valueInt: b.nonBilling, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.impression_count', valueInt: b.impression, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.profile_view_count', valueInt: b.profileView, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.feedback_like_count', valueInt: b.like, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.feedback_dislike_count', valueInt: b.dislike, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.feedback_report_count', valueInt: b.report, aggregationVersion: 'v1' });
    statRows.push({ date: dateObj, mentorId, metricKey: 'mentor.helped_user_count', valueInt: helped, aggregationVersion: 'v1' });
  }
  await prisma.dailyMentorStats.createMany({ data: statRows });
  console.log(`  日汇总: ${LAUNCH_DAYS} 天 × 10 指标`);

  // 知识卡 + 案例卡（caseText 非空为案例卡）
  const DOMAINS = ['职业规划', '简历优化', '面试技巧', '职场人际', '转行转型', 'offer选择', '实习转正', '职场晋升'];
  const cardRows: Array<{ cardId: string; mentorId: string; domain: string; title: string; caseText: string | null; coreView: string; reasoning: string | null; knowledgeClass: string; disclosureMode: string }> = [];
  const totalCards = cfg.knowledgeCards;
  const caseCardCount = cfg.caseCards;
  for (let i = 0; i < totalCards; i++) {
    const isCase = i < caseCardCount;
    cardRows.push({
      cardId: `${mentorId.toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
      mentorId,
      domain: rand(DOMAINS),
      title: isCase ? `案例${i + 1}：${rand(DOMAINS)}真实经历` : `观点卡${i + 1}：关于${rand(DOMAINS)}的建议`,
      caseText: isCase ? '案例背景：用户在某互联网公司工作两年，面临晋升瓶颈...经过：与导师两轮深入访谈后...结果：成功转岗并获得加薪。' : null,
      coreView: isCase ? '遇到瓶颈时，先盘点可迁移能力再决定内转还是外跳' : '职业选择应优先考虑长期成长空间而非短期薪资',
      reasoning: isCase ? '本案例中用户通过能力盘点找到了匹配的内转机会' : '短期高薪可能牺牲未来3-5年的成长曲线',
      knowledgeClass: 'external_approved',
      disclosureMode: isCase ? 'generalized' : 'none',
    });
  }
  await prisma.mentorKnowledgeCard.createMany({ data: cardRows });
  console.log(`  知识卡: ${totalCards} 张（其中案例卡 ${caseCardCount} 张）`);
}

async function main() {
  console.log(`开始生成平台演示数据（${MENTORS.length} 位导师，上线 ${LAUNCH_DAYS} 天）...\n`);

  // 清理所有 199 开头的演示用户（跨导师）
  console.log('清理旧演示用户...');
  const demoUsers = await prisma.user.findMany({ where: { phone: { startsWith: '199' } }, select: { id: true } });
  const demoIds = demoUsers.map((u) => u.id);
  if (demoIds.length > 0) {
    await prisma.messageFeedback.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.chatMessage.deleteMany({ where: { chatSession: { userId: { in: demoIds } } } });
    await prisma.chatSession.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.event.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.paymentOrder.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.user.deleteMany({ where: { id: { in: demoIds } } });
  }
  // 清理所有导师的日汇总
  await prisma.dailyMentorStats.deleteMany({});
  console.log(`已清理 ${demoIds.length} 个旧演示用户\n`);

  for (let idx = 0; idx < MENTORS.length; idx++) {
    const m = MENTORS[idx];
    console.log(`[${m.id}] ${m.name} (tier ${m.tier})`);
    await seedMentor(m.id, m.name, m.tier, idx);
    console.log('');
  }

  // 汇总
  const totalUsers = await prisma.user.count({ where: { phone: { startsWith: '199' } } });
  const totalOrders = await prisma.paymentOrder.count({ where: { status: 'PAID' } });
  console.log(`\n=== 平台汇总 ===`);
  console.log(`演示用户总数: ${totalUsers}`);
  console.log(`付费订单总数: ${totalOrders}`);
  console.log('平台演示数据生成完毕！');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
