/**
 * 聊天 API — 修复安全审计 A01-1.1, A03-3.1, A10-10.1
 * POST /api/chat
 *
 * 安全改进:
 * - 身份验证: 必须登录才能调用
 * - 速率限制: 每用户每分钟10次
 * - 输入校验: 消息长度和条数限制
 * - API URL 白名单: 防止 SSRF
 * - 会员/试用检查: 免费用户限制试用次数
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { chatMessageSchema } from '@/lib/validation';
import { getMentorById, buildSystemPrompt } from '@/lib/mentors';
import { getMentorQuota } from '@/lib/plans';
import { proxyFetch } from '@/lib/proxy-fetch';

// API URL 白名单 — 修复安全审计 A10-10.1
const ALLOWED_API_URLS = [
  'https://api.deepseek.com',
  'https://api.openai.com',
  'https://api.moonshot.cn',
];

// 消息长度限制
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES = 50;
const DAILY_MESSAGE_LIMIT = 50; // 每日消息上限
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 清除 AI 回复中的舞台提示词 (括号内的语气/动作/表情)
 */
function stripStageDirections(text: string): string {
  return text.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
}

export async function POST(request: NextRequest) {
  try {
    // 1. 身份验证
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '请先登录后再使用对话功能' },
        { status: 401 }
      );
    }

    // 2. 速率限制 — 每用户每分钟10次
    const clientIP = getClientIP(request);
    const rateKey = `chat:${session.user.id}`;
    const rateCheck = rateLimit(rateKey, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: '请求过于频繁，请稍后再试',
          retryAfter: Math.ceil((rateCheck.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rateCheck.resetTime - Date.now()) / 1000)) },
        }
      );
    }

    // 3. 解析并校验输入
    const body = await request.json();
    const parsed = chatMessageSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || '输入不合法' },
        { status: 400 }
      );
    }

    const { mentorId, messages, sessionId } = parsed.data;

    // 4. 构建导师人格 System Prompt — PRD 5.3 AI 引擎三层架构
    const mentor = getMentorById(mentorId);
    if (!mentor) {
      return NextResponse.json(
        { error: '导师不存在' },
        { status: 404 }
      );
    }

    // 从数据库实时获取会员状态 — 不依赖 JWT，避免支付后 token 过期导致权限判断错误
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPremium: true, freeTrialUsed: true },
    });

    // 用户不存在（JWT 过期/数据库重置后旧 session 仍有效）— 必须拦截，否则后续创建 ChatSession 会触发外键约束错误
    if (!dbUser) {
      console.error('Chat API: User not found in database, session.user.id =', session.user.id);
      return NextResponse.json(
        { error: '登录状态已失效，请重新登录', needRelogin: true },
        { status: 401 }
      );
    }

    const isPremium = dbUser.isPremium;
    const freeTrialUsed = dbUser.freeTrialUsed;
    const freeTrialLimit = parseInt(process.env.FREE_TRIAL_COUNT || '3', 10);

    // 5. 每日消息限额检查 (AI 职导) — 24小时滚动窗口
    let dailyMessageCount = 0;
    if (mentorId === 'ai-guide') {
      const twentyFourHoursAgo = new Date(Date.now() - ONE_DAY_MS);
      dailyMessageCount = await prisma.chatMessage.count({
        where: {
          chatSession: {
            userId: session.user.id,
            mentorId: 'ai-guide',
          },
          role: 'user',
          createdAt: { gt: twentyFourHoursAgo },
        },
      });

      if (dailyMessageCount >= DAILY_MESSAGE_LIMIT) {
        return NextResponse.json(
          {
            error: '在我这里，一天最多发送50条消息，明天再来吧。',
            dailyLimitReached: true,
          },
          { status: 429 }
        );
      }
    }

    // 6. 会员/试用检查 — 免费导师跳过
    if (!mentor.isFree && !isPremium) {
      // 非会员使用付费导师 — 先检查是否已完成 AI 职导访谈
      const userProfile = await prisma.userProfile.findUnique({
        where: { userId: session.user.id },
        select: { nickname: true, profileSource: true },
      });

      // profileSource = "ai_extracted" 表示通过访谈自动提取了档案
      // nickname 不为空表示有有效的档案数据（手动填写或访谈提取）
      const interviewCompleted =
        userProfile?.profileSource === 'ai_extracted' ||
        (userProfile?.nickname != null && userProfile.nickname.length > 0);

      if (!interviewCompleted) {
        // 未完成访谈 — 引导用户去 AI 职导完成访谈
        return NextResponse.json(
          {
            error: '请先完成AI职导的访谈对话，才能与行业导师交流',
            needQuestionnaire: true,
          },
          { status: 403 }
        );
      }

      // 访谈已完成 — 检查免费试用次数
      if (freeTrialUsed >= freeTrialLimit) {
        // 免费试用次数已用完
        return NextResponse.json(
          {
            error: `${mentor.name} 需要会员才能对话`,
            needSubscription: true,
            freeTrialUsed,
            freeTrialLimit,
          },
          { status: 403 }
        );
      }
      // 免费试用次数未用完 — 允许对话，稍后递增试用计数
    }

    // 6.5 导师分身对话次数配额检查（非 AI 职导）
    let mentorUsedCount = 0;
    let mentorQuotaLimit: number | null = null;
    if (mentorId !== 'ai-guide' && isPremium) {
      // 获取当前有效订阅
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: session.user.id,
          status: 'ACTIVE',
          endDate: { gt: new Date() },
        },
        orderBy: { endDate: 'desc' },
        select: { plan: true, startDate: true },
      });

      if (subscription) {
        mentorQuotaLimit = getMentorQuota(subscription.plan);

        // 有配额限制的套餐：检查已用次数
        if (mentorQuotaLimit !== null) {
          mentorUsedCount = await prisma.chatMessage.count({
            where: {
              role: 'user',
              createdAt: { gte: subscription.startDate },
              chatSession: {
                userId: session.user.id,
                mentorId: { not: 'ai-guide' },
              },
            },
          });

          if (mentorUsedCount >= mentorQuotaLimit) {
            return NextResponse.json(
              {
                error: `你的导师分身对话次数已用完（${mentorUsedCount}/${mentorQuotaLimit}），升级更高套餐可获得更多次数`,
                quotaExceeded: true,
                mentorUsed: mentorUsedCount,
                mentorLimit: mentorQuotaLimit,
              },
              { status: 429 }
            );
          }
        }
      }
    }

    const lastUserMessage = messages[messages.length - 1];
    let systemPrompt = buildSystemPrompt(mentor, lastUserMessage?.content || '');

    // AI 职导：检查问卷是否已完成（通过 UserProfile 数据判断，非仅存在性）
    if (mentorId === 'ai-guide') {
      const userProfile = await prisma.userProfile.findUnique({
        where: { userId: session.user.id },
        select: { nickname: true, age: true, school: true, major: true, city: true, interests: true, goals: true, recommendedMentors: true, profileSource: true },
      });

      // 判断访谈是否已完成：profileSource 为 ai_extracted 或 nickname 有值
      const interviewCompleted =
        userProfile?.profileSource === 'ai_extracted' ||
        (userProfile?.nickname != null && userProfile.nickname.length > 0);

      if (interviewCompleted && userProfile) {
        // 轻量模式：问卷已完成，使用简洁的问答 prompt
        systemPrompt = `# 角色定位
你是AI职导，AI Career Companion 平台的 AI 职业导师。你的职责是为用户推荐合适的导师分身。

# 核心规则
1. 不编造事实、不虚构案例和数据、不假装专家。
2. 当对方要求介绍工作，或者询问打听某个具体职位的薪资待遇或者人事情况时，要很有礼貌地告诉对方：这里主要是帮助大家解决一些求职中遇到的困扰与疑问，但并不会介绍或引荐工作岗位，也无法告知用户某家企业某个职位的任何信息。
3. 不灌鸡汤，不说空话套话。第一人称说话，用"我"。
4. 回复简洁，每次回复控制在100字以内。
5. 主要功能：了解用户目前最大的困惑是什么，然后推荐合适的导师分身。
6. 如果用户的问题超出你的能力范围，礼貌地推荐用户去和对应的行业导师分身对话。
7. 不要再进行问卷访谈，不要主动提问收集信息。
8. 目前导师分身拥有的知识经验，主要为高校学生求职提供服务，为其他群体提供的服务，会在今后逐渐完善。

# 用户档案数据（来自数据库）
- 称呼：${userProfile.nickname || '未知'}
- 年龄：${userProfile.age || '未知'}
- 学校：${userProfile.school || '未知'}
- 专业：${userProfile.major || '未知'}
- 城市：${userProfile.city || '未知'}
- 兴趣方向：${userProfile.interests || '未知'}
- 职业目标：${userProfile.goals || '未知'}
${userProfile.recommendedMentors ? `- 之前推荐的导师：${userProfile.recommendedMentors}` : ''}

请根据以上档案数据与用户对话，称呼用户时使用其昵称。`;

        const remainingCount = DAILY_MESSAGE_LIMIT - dailyMessageCount;
        systemPrompt += `\n\n# 当前对话状态（系统实时数据，请严格使用以下数字）\n- 今日已发送消息数：${dailyMessageCount}\n- 每日消息上限：${DAILY_MESSAGE_LIMIT}\n- 剩余可用消息数：${remainingCount}\n\n当用户询问剩余对话次数、已用次数或消息额度时，必须直接使用上述数字回答，不要估算、猜测或编造。`;
      } else {
        // 问卷模式：注入实时消息计数
        const remainingCount = DAILY_MESSAGE_LIMIT - dailyMessageCount;
        systemPrompt += `\n\n# 当前对话状态（系统实时数据，请严格使用以下数字）\n- 今日已发送消息数：${dailyMessageCount}\n- 每日消息上限：${DAILY_MESSAGE_LIMIT}\n- 剩余可用消息数：${remainingCount}\n\n当用户询问剩余对话次数、已用次数或消息额度时，必须直接使用上述数字回答，不要估算、猜测或编造。格式参考："你今天已经用了${dailyMessageCount}次，还剩${remainingCount}次。"`;
      }
    }

    // 7. API URL 白名单校验 — 修复安全审计 A10
    const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
    const baseUrl = apiUrl.replace(/\/v\d+\/?$/, '');
    if (!ALLOWED_API_URLS.includes(baseUrl)) {
      console.error('API URL not in allowlist:', baseUrl);
      return NextResponse.json(
        { error: '服务配置错误' },
        { status: 500 }
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.AI_MODEL || 'deepseek-chat';

    // 8. 调用 AI API — 使用 proxyFetch 穿透沙箱代理
    const aiResponse = await proxyFetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: stripStageDirections(m.content).slice(0, MAX_MESSAGE_LENGTH),
          })),
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API error:', aiResponse.status);
      // 降级响应
      return NextResponse.json({
        reply: '抱歉，我暂时无法回复，请稍后再试。',
        degraded: true,
      });
    }

    const aiData = await aiResponse.json();
    const reply = stripStageDirections(
      aiData.choices?.[0]?.message?.content || '抱歉，我没有理解你的问题。'
    );

    // 9. 保存对话到数据库
    let chatSessionId = sessionId;
    // 验证 sessionId 是否有效（存在且属于当前用户）— 防止 localStorage 中的过期 sessionId 导致外键约束错误
    if (chatSessionId) {
      const existingSession = await prisma.chatSession.findFirst({
        where: { id: chatSessionId, userId: session.user.id },
        select: { id: true },
      });
      if (!existingSession) {
        // sessionId 无效或已过期 — 创建新会话
        chatSessionId = undefined;
      }
    }
    if (!chatSessionId) {
      // 创建新的聊天会话
      const chatSession = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          mentorId,
          title: messages[0]?.content.slice(0, 50) || '新对话',
        },
      });
      chatSessionId = chatSession.id;
    }

    // 保存用户消息和 AI 回复
    if (lastUserMessage && lastUserMessage.role === 'user') {
      await prisma.chatMessage.create({
        data: {
          chatSessionId,
          role: 'user',
          content: lastUserMessage.content,
        },
      });
    }

    await prisma.chatMessage.create({
      data: {
        chatSessionId,
        role: 'assistant',
        content: reply,
        tokensUsed: aiData.usage?.total_tokens,
        modelUsed: model,
      },
    });

    // 更新会话消息计数
    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { messageCount: { increment: 2 } },
    });

    // 10. 非会员扣减免费试用次数 — 免费导师跳过
    if (!isPremium && !mentor.isFree) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { freeTrialUsed: { increment: 1 } },
      });
    }

    // 11. 返回回复
    // 非会员使用付费导师：返回免费试用次数信息
    // 会员使用付费导师：返回配额信息
    let respMentorUsed: number | undefined;
    let respMentorLimit: number | null | undefined;
    if (mentorId !== 'ai-guide') {
      if (!isPremium && !mentor.isFree) {
        // 非会员 — 返回免费试用次数
        respMentorUsed = freeTrialUsed + 1;
        respMentorLimit = freeTrialLimit;
      } else if (isPremium) {
        // 会员 — 返回配额信息
        respMentorUsed = mentorUsedCount + 1;
        respMentorLimit = mentorQuotaLimit; // null = 无限
      }
    }

    return NextResponse.json({
      reply,
      sessionId: chatSessionId,
      degraded: false,
      freeTrialRemaining: isPremium || mentor.isFree ? null : freeTrialLimit - freeTrialUsed - 1,
      dailyMessageCount: mentorId === 'ai-guide' ? dailyMessageCount + 1 : undefined,
      dailyMessageLimit: mentorId === 'ai-guide' ? DAILY_MESSAGE_LIMIT : undefined,
      mentorUsed: respMentorUsed,
      mentorLimit: respMentorLimit,
    });
  } catch (error) {
    console.error('Chat API error:', error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error');
    console.error('Chat API error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: '服务器错误，请稍后再试' },
      { status: 500 }
    );
  }
}
