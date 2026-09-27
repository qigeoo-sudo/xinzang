import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { fetchWithRetry } from '@/lib/ai-retry';

/**
 * POST /api/chat/summary
 * 对话回顾里程碑（2026-09-26 新规则）：
 * - 小结（mini，50 字以内）：每场对话聊完即出，覆盖本场全部轮次
 * - 总结（major，100 字以内）：每位导师分身各自累计轮次逢整十（10/20/30…）出一张，
 *   覆盖该导师最近一个周期（上一张总结之后到现在），作为历史总结留存
 * atCount 统一存"该导师累计的全局轮次"：小结 = 本场最后一轮的全局序号；总结 = 整十值。
 * 同一场会话内 atCount 互不相同（末轮恰逢整十时只出总结，不出小结）。
 * 每次请求只生成"下一条还没生成的里程碑"，前端可重复调用直到 caughtUp。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const chatSession = await prisma.chatSession.findFirst({
    where: { id: sessionId, userId: session.user.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true },
      },
      milestones: { select: { atCount: true } },
    },
  });

  if (!chatSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // 一轮 = 用户一次发言（含导师的回复）
  const userTurns = chatSession.messages.filter((m) => m.role === 'user').length;
  if (userTurns === 0) {
    return NextResponse.json({ triggered: false, caughtUp: true, rounds: 0 });
  }

  // 该导师分身的全部会话（时间正序），算出本会话之前的累计轮次
  const siblingSessions = await prisma.chatSession.findMany({
    where: { userId: session.user.id, mentorId: chatSession.mentorId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const siblingCounts = await prisma.chatMessage.groupBy({
    by: ['chatSessionId'],
    where: {
      role: 'user',
      chatSessionId: { in: siblingSessions.map((s) => s.id) },
    },
    _count: { _all: true },
  });
  const countBySession = new Map(
    siblingCounts.map((g) => [g.chatSessionId, g._count?._all ?? 0]),
  );
  let prevRounds = 0;
  for (const s of siblingSessions) {
    if (s.id === sessionId) break;
    prevRounds += countBySession.get(s.id) ?? 0;
  }

  // 待生成条目（按全局轮次升序，每次只生成最早的一条）：
  // - 会话内扫过的整十轮 → major
  // - 场末（末轮非整十）→ mini
  const existing = new Set(chatSession.milestones.map((m) => m.atCount));
  const globalEnd = prevRounds + userTurns;
  const tasks: { at: number; type: 'mini' | 'major' }[] = [];
  for (let g = Math.floor(prevRounds / 10) * 10 + 10; g <= globalEnd; g += 10) {
    if (!existing.has(g)) tasks.push({ at: g, type: 'major' });
  }
  if (globalEnd % 10 !== 0 && !existing.has(globalEnd)) {
    tasks.push({ at: globalEnd, type: 'mini' });
  }
  if (tasks.length === 0) {
    return NextResponse.json({ triggered: false, caughtUp: true, rounds: globalEnd });
  }
  const task = tasks[0];

  // 一轮 → 消息区间映射：userIndexes[i] = 第 i+1 轮用户消息在 messages 中的下标
  const userIndexes = chatSession.messages
    .map((m, i) => (m.role === 'user' ? i : -1))
    .filter((i) => i >= 0);

  let rangeMessages: { role: string; content: string }[];
  if (task.type === 'mini') {
    // 小结：本场全部对话
    rangeMessages = chatSession.messages.slice(0, (userIndexes[userTurns - 1] ?? 0) + 1);
  } else {
    // 总结：本导师最近一个周期（全局 (at-10, at] 轮），映射到本会话内的消息区间
    const cycleStartGlobal = task.at - 10;
    const offStart = Math.max(1, cycleStartGlobal - prevRounds + 1); // 会话内起始轮位
    const offEnd = task.at - prevRounds;                             // 会话内结束轮位
    const startMsg = offStart <= 1 ? 0 : (userIndexes[offStart - 2] ?? -1) + 1;
    const endMsg = (userIndexes[offEnd - 1] ?? chatSession.messages.length - 1) + 1;
    rangeMessages = chatSession.messages.slice(startMsg, endMsg + 1);
  }

  const dialogueText = rangeMessages
    .map((m) => `${m.role === 'user' ? '你' : '导师'}：${m.content.slice(0, task.type === 'major' ? 160 : 220)}`)
    .join('\n');

  const systemPrompt = task.type === 'mini'
    ? `你是对话回顾助手。用户刚和同一位导师分身聊完一场（共 ${userTurns} 轮）。请用 50 字以内，概括"这一场"对话的核心内容。要求：
1. 用第二人称"你"的视角
2. 只写这场聊的话题与收获
3. 语气自然，像朋友帮你回忆
4. 不超过 50 个汉字`
    : `你是对话回顾助手。用户与这位导师分身的累计对话达到了 ${task.at} 轮。请用 100 字以内，对"最近一个周期（上一份总结之后的这些轮次）"做一次阶段总结。要求：
1. 用第二人称"你"的视角
2. 梳理这段的主要话题、关键结论与你的成长变化
3. 语气温暖自然
4. 不超过 100 个汉字`;

  const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'deepseek-chat';

  if (!apiKey) {
    return NextResponse.json({ triggered: false, caughtUp: false, error: 'AI 服务未配置' }, { status: 503 });
  }

  try {
    const aiResponse = await fetchWithRetry(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dialogueText },
        ],
        max_tokens: task.type === 'major' ? 260 : 140,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text().catch(() => '');
      console.error('Milestone AI error:', aiResponse.status, errorBody.slice(0, 300));
      return NextResponse.json({ triggered: false, caughtUp: false, error: 'AI 生成失败' }, { status: 502 });
    }

    const data = await aiResponse.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';

    await prisma.chatMilestone.upsert({
      where: { sessionId_atCount: { sessionId, atCount: task.at } },
      create: { sessionId, type: task.type, atCount: task.at, content },
      update: { type: task.type, content },
    });

    return NextResponse.json({
      triggered: true,
      caughtUp: tasks.length <= 1,
      rounds: globalEnd,
      milestone: { type: task.type, atCount: task.at, content },
    });
  } catch (error) {
    console.error('Milestone generation error:', error);
    return NextResponse.json({ triggered: false, caughtUp: false, error: 'Generation failed' }, { status: 500 });
  }
}
