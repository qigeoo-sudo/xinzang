/**
 * 演示数据种子 — 为导师后台视图生成多用户浏览/对话/订阅/反馈数据
 * 仅用于本地开发测试，生产环境勿运行。
 *   npx tsx scripts/seed-demo-data.ts --mentor=lydiachen --users=12
 */
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  CAREER_OPTIONS,
  HELP_PRIORITY_OPTIONS,
  MENTOR_PREFERENCE_OPTIONS,
} from '../src/lib/register-options';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]),
);
const MENTOR_ID = args.mentor ?? 'lydiachen';
const USER_COUNT = parseInt(args.users ?? '12', 10);
const NOW = new Date();
const DAY_MS = 24 * 3600_000;

const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const pastDate = (daysAgo: number) => new Date(today.getTime() - daysAgo * DAY_MS);

// 样本数据池
const FIRST_NAMES = ['张', '李', '王', '赵', '陈', '刘', '杨', '黄', '吴', '周', '徐', '孙'];
const MAJORS = ['计算机科学', '金融学', '心理学', '机械工程', '新闻传播', '工商管理', '设计学', '法学', '医学', '教育学', '电子工程', '建筑学'];
const PROVINCES = ['上海', '北京', '广东', '浙江', '江苏', '四川', '湖北', '湖南', '福建', '山东', '河南', '陕西'];
const STATUSES = ['在校', '在职', '待业'];
const RIASEC_CODES = ['R', 'I', 'A', 'S', 'E', 'C'];
const REPORT_REASONS = ['OFFENSIVE', 'OFF_TOPIC', 'HALLUCINATION', 'REPETITIVE', 'OTHER'] as const;

// 焦虑原文池（故意围绕几个主题，便于 LLM 归类）
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

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}
function randBool(p = 0.5) {
  return Math.random() < p;
}

async function hash(pwd: string) {
  return bcrypt.hash(pwd, 12);
}

/** 加权日期偏移：50% 近7天，30% 8-30天，20% 31-80天 */
function weightedDayOffset(): number {
  const r = Math.random();
  if (r < 0.5) return randInt(0, 6);
  if (r < 0.8) return randInt(7, 29);
  return randInt(30, 79);
}

async function main() {
  // 确保 mentor 存在
  const mentorUser = await prisma.user.findFirst({ where: { boundMentorId: MENTOR_ID } });
  if (!mentorUser) {
    console.error(`未找到绑定 ${MENTOR_ID} 的导师账号`);
    process.exit(1);
  }

  // 清理旧演示数据（防止多次运行累积导致不一致）
  console.log('清理旧数据...');
  const demoUserIds = await prisma.user.findMany({
    where: { phone: { startsWith: '199' } },
    select: { id: true },
  });
  const demoIdList = demoUserIds.map((u) => u.id);
  await prisma.messageFeedback.deleteMany({ where: { mentorId: MENTOR_ID } });
  await prisma.chatMessage.deleteMany({
    where: { chatSession: { mentorId: MENTOR_ID } },
  });
  await prisma.chatSession.deleteMany({ where: { mentorId: MENTOR_ID } });
  await prisma.event.deleteMany({
    where: { props: { contains: MENTOR_ID } },
  });
  await prisma.dailyMentorStats.deleteMany({ where: { mentorId: MENTOR_ID } });
  if (demoIdList.length > 0) {
    await prisma.subscription.deleteMany({
      where: { userId: { in: demoIdList } },
    });
    await prisma.paymentOrder.deleteMany({
      where: { userId: { in: demoIdList } },
    });
  }
  console.log('旧数据已清理');

  // 创建测试用户
  const users: Array<{ id: string; phone: string }> = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const phone = `199${String(10000000 + i).padStart(8, '0')}`;
    const birthYear = randInt(1995, 2004);
    const birthMonth = `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}`;
    const curProvince = rand(PROVINCES);
    const workProvince = rand(PROVINCES);
    const major = rand(MAJORS);
    const status = rand(STATUSES);
    const riasec = rand(RIASEC_CODES);

    // 画像选填区
    const careerValues = pickN(CAREER_OPTIONS.map((o) => o.value), randInt(2, 4));
    const helpValue = rand(HELP_PRIORITY_OPTIONS).value;
    const mentorPrefs = pickN(MENTOR_PREFERENCE_OPTIONS.map((o) => o.value), randInt(2, 3));
    const anxiety = rand(ANXIETY_TEXTS);

    const user = await prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        passwordHash: await hash('demo1234'),
        name: `${rand(FIRST_NAMES)}${String.fromCharCode(0x4e00 + Math.floor(Math.random() * 2000))}`,
        role: 'USER',
        userGroup: 'NORMAL',
        freeTrialUsed: 0,
        profile: {
          create: {
            nickname: `用户${i + 1}`,
            status,
            birthMonth,
            major,
            curProvince,
            workProvince,
            careers: JSON.stringify(careerValues),
            helpPriority: JSON.stringify([helpValue]),
            mentorPreference: JSON.stringify(mentorPrefs),
            careerAnxiety: anxiety,
          },
        },
        interestAssessment: {
          create: {
            scores: JSON.stringify({ R: randInt(30, 80), I: randInt(30, 80), A: randInt(30, 80), S: randInt(30, 80), E: randInt(30, 80), C: randInt(30, 80) }),
            answers: '[]',
            questionVersion: 'v2',
            code: riasec + rand(RIASEC_CODES) + rand(RIASEC_CODES),
          },
        },
      },
      update: {
        userGroup: 'NORMAL',
        profile: {
          update: {
            status,
            birthMonth,
            major,
            curProvince,
            workProvince,
            careers: JSON.stringify(careerValues),
            helpPriority: JSON.stringify([helpValue]),
            mentorPreference: JSON.stringify(mentorPrefs),
            careerAnxiety: anxiety,
          },
        },
      },
      include: { profile: true },
    });
    users.push({ id: user.id, phone });
  }
  console.log(`用户: ${users.length} 个`);

  // 先决定每个用户的购买计划（确保消息 source 与订单一致）
  // 约 40% 用户付费，每个付费用户 1-3 次购买
  const SUBSCRIPTION_PLANS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
  type Purchase = { type: 'SUBSCRIPTION'; plan: typeof SUBSCRIPTION_PLANS[number] } | { type: 'CREDIT_PACK' };
  const userPurchases = new Map<string, Purchase[]>();
  for (const u of users) {
    if (!randBool(0.4)) { userPurchases.set(u.id, []); continue; }
    const purchases: Purchase[] = [];
    const purchaseCount = randInt(1, 3);
    for (let p = 0; p < purchaseCount; p++) {
      if (randBool(0.75)) {
        purchases.push({ type: 'SUBSCRIPTION', plan: rand(SUBSCRIPTION_PLANS) });
      } else {
        purchases.push({ type: 'CREDIT_PACK' });
      }
    }
    userPurchases.set(u.id, purchases);
  }

  // 为每个用户创建会话和消息
  const sessions: Array<{ id: string; userId: string }> = [];
  const messages: Array<{ id: string; chatSessionId: string; role: string; createdAt: Date; entitlementSource: string | null }> = [];

  for (const u of users) {
    const purchases = userPurchases.get(u.id) ?? [];
    // 会话数 = 1（免费）+ 购买次数（每个购买对应一个付费会话）
    const sessionCount = 1 + purchases.length;
    for (let s = 0; s < sessionCount; s++) {
      const createdAt = pastDate(weightedDayOffset());
      const sess = await prisma.chatSession.create({
        data: {
          userId: u.id,
          mentorId: MENTOR_ID,
          title: `会话${s + 1}`,
          createdAt,
        },
      });
      sessions.push({ id: sess.id, userId: u.id });

      // 第一个会话用免费试用，后续会话对应用户的第 s-1 次购买
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

      // 3-8 轮对话，该会话所有消息共用同一权益来源
      const rounds = randInt(3, 8);

      for (let r = 0; r < rounds; r++) {
        const msgTime = new Date(createdAt.getTime() + r * 60000 + Math.random() * 30000);
        await prisma.chatMessage.create({
          data: {
            chatSessionId: sess.id,
            role: 'user',
            content: `这是第${r + 1}轮用户问题...`,
            createdAt: msgTime,
          },
        });

        const assistantMsg = await prisma.chatMessage.create({
          data: {
            chatSessionId: sess.id,
            role: 'assistant',
            content: `这是第${r + 1}轮导师回复...`,
            createdAt: new Date(msgTime.getTime() + 5000),
            entitlementSource: sessionSource,
          },
        });
        messages.push({ id: assistantMsg.id, chatSessionId: sess.id, role: 'assistant', createdAt: assistantMsg.createdAt, entitlementSource: sessionSource });
      }
    }
  }
  console.log(`会话: ${sessions.length} 条, 消息: ${messages.filter(m => m.role === 'assistant').length} 条`);

  // 创建反馈（赞/踩/报错）
  const feedbackCount = Math.floor(messages.length * 0.25);
  const feedbackTypes: Array<'LIKE' | 'DISLIKE' | 'REPORT'> = ['LIKE', 'LIKE', 'LIKE', 'DISLIKE', 'REPORT'];
  const shuffledMsgs = [...messages].sort(() => Math.random() - 0.5);
  const feedbackRows: { ts: Date; feedbackType: 'LIKE' | 'DISLIKE' | 'REPORT' }[] = [];
  for (let i = 0; i < feedbackCount; i++) {
    const msg = shuffledMsgs[i];
    const sess = sessions.find(s => s.id === msg.chatSessionId)!;
    const ft = rand(feedbackTypes);
    await prisma.messageFeedback.upsert({
      where: { messageId: msg.id },
      create: {
        messageId: msg.id,
        userId: sess.userId,
        mentorId: MENTOR_ID,
        feedbackType: ft,
        reportReason: ft === 'REPORT' ? rand(REPORT_REASONS) : null,
      },
      update: {
        feedbackType: ft,
        reportReason: ft === 'REPORT' ? rand(REPORT_REASONS) : null,
      },
    });
    feedbackRows.push({ ts: msg.createdAt, feedbackType: ft });
  }
  console.log(`反馈: ${feedbackCount} 条`);

  // 创建浏览事件（曝光 + 主页访问）
  const eventRows: { ts: Date; eventName: string }[] = [];
  for (const u of users) {
    // 每个用户 1-3 次曝光，0-2 次主页访问
    const impressionCount = randInt(1, 3);
    for (let e = 0; e < impressionCount; e++) {
      const ts = pastDate(weightedDayOffset());
      await prisma.event.create({
        data: {
          eventId: crypto.randomUUID(),
          eventName: 'mentor_card.impression',
          userId: u.id,
          userGroupSnapshot: 'NORMAL',
          page: '/mentors',
          target: `mentor-card-${MENTOR_ID}`,
          props: JSON.stringify({ mentorId: MENTOR_ID }),
          clientTs: ts,
        },
      });
      eventRows.push({ ts, eventName: 'mentor_card.impression' });
    }
    const viewCount = randInt(0, 2);
    for (let e = 0; e < viewCount; e++) {
      const ts = pastDate(weightedDayOffset());
      await prisma.event.create({
        data: {
          eventId: crypto.randomUUID(),
          eventName: 'mentor_profile.view',
          userId: u.id,
          userGroupSnapshot: 'NORMAL',
          page: `/mentors/${MENTOR_ID}`,
          target: `mentor-profile-${MENTOR_ID}`,
          props: JSON.stringify({ mentorId: MENTOR_ID }),
          clientTs: ts,
        },
      });
      eventRows.push({ ts, eventName: 'mentor_profile.view' });
    }
  }
  console.log(`浏览事件已创建`);

  // 创建订阅/加榨包订单（与消息 source 一致的预生成购买计划）
  let subCount = 0;
  let packCount = 0;
  for (const u of users) {
    const purchases = userPurchases.get(u.id) ?? [];
    for (let p = 0; p < purchases.length; p++) {
      const orderNo = `DEMO_${Date.now()}_${u.id.slice(-4)}_${p}`;
      const createdAt = pastDate(weightedDayOffset());
      const purchase = purchases[p];
      if (purchase.type === 'SUBSCRIPTION') {
        const plan = purchase.plan;
        const amount = plan === 'MONTHLY' ? 59 : plan === 'QUARTERLY' ? 169 : 599;
        const order = await prisma.paymentOrder.create({
          data: {
            userId: u.id,
            orderNo,
            status: 'PAID',
            paymentType: 'SUBSCRIPTION',
            amount,
            paidAt: createdAt,
            createdAt,
          },
        });
        await prisma.subscription.create({
          data: {
            userId: u.id,
            plan,
            status: 'ACTIVE',
            startDate: createdAt,
            endDate: new Date(createdAt.getTime() + 30 * 24 * 3600_1000),
            paymentOrderId: order.id,
          },
        });
        subCount++;
      } else {
        await prisma.paymentOrder.create({
          data: {
            userId: u.id,
            orderNo,
            status: 'PAID',
            paymentType: 'CREDIT_PACK',
            amount: randBool(0.5) ? 29 : 99,
            paidAt: createdAt,
            createdAt,
          },
        });
        packCount++;
      }
    }
  }
  const paidUserCount = [...userPurchases.values()].filter((p) => p.length > 0).length;
  console.log(`付费用户: ${paidUserCount} 人, 订阅订单: ${subCount}, 加榨包订单: ${packCount}`);

  // DailyMentorStats 日汇总：按本次实际生成的消息/事件/反馈逐日落库
  // 种子数据时间戳回填到过去，每日凌晨的聚合不会重算它们，故在此直接写日行。
  const sessionUser = new Map(sessions.map((s) => [s.id, s.userId]));

  /** 北京日零点（UTC 毫秒） */
  const bjDayStartMs = (t: Date) => {
    const shifted = t.getTime() + 8 * 3600_000;
    return Math.floor(shifted / DAY_MS) * DAY_MS - 8 * 3600_000;
  };
  const isCompletedSrc = (src: string | null) =>
    src === 'FREE_TRIAL' ||
    src === 'CREDIT_PACK' ||
    src === 'SUBSCRIPTION' ||
    src?.startsWith('SUBSCRIPTION_');
  const isBilledSrc = (src: string | null) =>
    src === 'CREDIT_PACK' || src === 'SUBSCRIPTION' || src?.startsWith('SUBSCRIPTION_');

  // 每个用户最早一轮完成轮次（用于累计帮助用户）
  const firstCompleted = new Map<string, number>();
  for (const m of messages) {
    if (!isCompletedSrc(m.entitlementSource)) continue;
    const uid = sessionUser.get(m.chatSessionId);
    if (!uid) continue;
    const t = m.createdAt.getTime();
    const prev = firstCompleted.get(uid);
    if (prev === undefined || t < prev) firstCompleted.set(uid, t);
  }

  // 按北京日分桶
  interface DayBucket {
    completed: number;
    billed: number;
    free: number;
    nonBilling: number;
    impression: number;
    profileView: number;
    like: number;
    dislike: number;
    report: number;
  }
  const emptyBucket = (): DayBucket => ({
    completed: 0, billed: 0, free: 0, nonBilling: 0,
    impression: 0, profileView: 0, like: 0, dislike: 0, report: 0,
  });
  const buckets = new Map<number, DayBucket>();
  const getBucket = (ms: number) => {
    const b = buckets.get(ms) ?? emptyBucket();
    buckets.set(ms, b);
    return b;
  };

  for (const m of messages) {
    const b = getBucket(bjDayStartMs(m.createdAt));
    if (isCompletedSrc(m.entitlementSource)) b.completed++;
    if (isBilledSrc(m.entitlementSource)) b.billed++;
    if (m.entitlementSource === 'FREE_TRIAL') b.free++;
    if (m.entitlementSource === 'NON_BILLING') b.nonBilling++;
  }
  for (const e of eventRows) {
    const b = getBucket(bjDayStartMs(e.ts));
    if (e.eventName === 'mentor_card.impression') b.impression++;
    if (e.eventName === 'mentor_profile.view') b.profileView++;
  }
  for (const f of feedbackRows) {
    const b = getBucket(bjDayStartMs(f.ts));
    if (f.feedbackType === 'LIKE') b.like++;
    else if (f.feedbackType === 'DISLIKE') b.dislike++;
    else b.report++;
  }

  const upsertStat = async (date: Date, metricKey: string, valueInt: number) => {
    const existing = await prisma.dailyMentorStats.findFirst({
      where: { date, mentorId: MENTOR_ID, metricKey, aggregationVersion: 'v1' },
    });
    if (existing) {
      await prisma.dailyMentorStats.update({
        where: { id: existing.id },
        data: { valueInt },
      });
    } else {
      await prisma.dailyMentorStats.create({
        data: { date, mentorId: MENTOR_ID, metricKey, valueInt, aggregationVersion: 'v1' },
      });
    }
  };

  for (let d = 0; d < 90; d++) {
    const dayMs = bjDayStartMs(pastDate(d));
    const dateObj = new Date(dayMs);
    const dayEndMs = dayMs + DAY_MS;
    const b = buckets.get(dayMs) ?? emptyBucket();
    // 截至当日结束已有完成轮次的用户数（累计帮助）
    let helped = 0;
    for (const t of firstCompleted.values()) if (t < dayEndMs) helped++;

    await Promise.all([
      upsertStat(dateObj, 'mentor.completed_qa_rounds', b.completed),
      upsertStat(dateObj, 'mentor.billed_rounds', b.billed),
      upsertStat(dateObj, 'mentor.free_trial_rounds', b.free),
      upsertStat(dateObj, 'mentor.non_billing_replies', b.nonBilling),
      upsertStat(dateObj, 'mentor.impression_count', b.impression),
      upsertStat(dateObj, 'mentor.profile_view_count', b.profileView),
      upsertStat(dateObj, 'mentor.feedback_like_count', b.like),
      upsertStat(dateObj, 'mentor.feedback_dislike_count', b.dislike),
      upsertStat(dateObj, 'mentor.feedback_report_count', b.report),
      upsertStat(dateObj, 'mentor.helped_user_count', helped),
    ]);
  }
  console.log(`日汇总: 90 天 × 10 指标（按真实生成记录）`);

  console.log('演示数据生成完毕！');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
