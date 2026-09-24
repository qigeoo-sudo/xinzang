/**
 * 管理员聊天记录导出 API
 * GET /api/admin/export-chat-md?mentor=lydiachen&user=手机号或邮箱&from=2026-09-01&to=2026-09-10&keyword=简历
 *
 * - 仅限 role=ADMIN 的登录用户访问（每次从数据库校验，不信任旧 session token）
 * - 输出通俗易读的 Markdown 文件（浏览器直接下载），技术字段附通俗解释
 * - 与 scripts/export-chat-logs.ts 的输出格式保持一致
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getMentorById } from '@/lib/mentors';
import { rateLimit } from '@/lib/rate-limit';

// 单次导出会话数上限，防止内存爆掉
const MAX_SESSIONS = 1000;

function fmtDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mentorDisplayName(mentorId: string): string {
  return getMentorById(mentorId)?.name || mentorId;
}

function parseDateParam(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

const FIELD_NOTES = `

---

## 附注：技术字段说明

以上对话中出现的括号标注含义如下，供非技术背景的读者参考：

- **命中知识卡**：导师分身的回答不是凭空生成的，背后有一套"知识卡"机制——
  每张卡是导师本人在访谈中确认过的一段经验或观点（比如"面试中如何考察候选人"）。
  标注"命中知识卡：LYD-R2-005"表示这一轮回答引用了编号为 LYD-R2-005 的知识卡内容。
  标注"无"表示这一轮没有命中知识卡，回答来自导师人格设定 + AI 模型自身知识。
  **这个字段可以帮助判断：回答的质量是来自精心准备的知识库，还是依赖模型即兴发挥。**

- **使用模型**：生成这条回复时调用的 AI 模型名称。
  "deepseek-chat"即 DeepSeek 的对话模型。不同模型的回答风格和质量可能不同。
  如果显示为 **mentor-router**，表示这条回复没有调用 AI 大模型，而是系统的"领域路由"直接生成的——
  当用户话题明显超出该导师擅长范围时，路由会礼貌地把话题拉回职业方向，属于正常的边界保护机制。

- **消耗Token**：这条回复消耗的 AI 计算资源量，类似"这段对话花了多少算力"。
  数字越大说明回复越长或越复杂。
`;

function formatMessage(msg: {
  role: string;
  content: string;
  createdAt: Date;
  hitCardIds: string | null;
  modelUsed: string | null;
  tokensUsed: number | null;
}): string {
  const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '导师分身' : '系统';
  let line = `**${role}**　${fmtDate(new Date(msg.createdAt))}\n\n${msg.content}\n`;

  if (msg.role === 'assistant') {
    const notes: string[] = [];
    let cardIds = '无';
    if (msg.hitCardIds) {
      try {
        const parsed = JSON.parse(msg.hitCardIds);
        if (Array.isArray(parsed) && parsed.length > 0) cardIds = parsed.join('、');
      } catch {}
    }
    notes.push(`命中知识卡：${cardIds}`);
    if (msg.modelUsed) notes.push(`使用模型：${msg.modelUsed}`);
    if (msg.tokensUsed != null) notes.push(`消耗Token：${msg.tokensUsed}`);
    line += `\n> ${notes.join('　|　')}\n`;
  }

  return line;
}

export async function GET(request: NextRequest) {
  // ---------- 鉴权：登录 + 数据库实时校验 ADMIN 角色 ----------
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me || me.role !== 'ADMIN') {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  // 速率限制（管理员也限，防误用/爬取）
  const rateCheck = rateLimit(`admin-export:${session.user.id}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
  }

  // ---------- 解析查询参数 ----------
  const { searchParams } = new URL(request.url);
  const mentor = searchParams.get('mentor') || undefined;
  const userParam = searchParams.get('user') || undefined;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const keyword = searchParams.get('keyword') || undefined;

  const where: Record<string, unknown> = {};
  if (mentor) where.mentorId = mentor;

  if (userParam) {
    const users = await prisma.user.findMany({
      where: { OR: [{ phone: userParam }, { email: userParam }] },
      select: { id: true },
    });
    if (users.length === 0) {
      return NextResponse.json({ error: `未找到用户: ${userParam}` }, { status: 404 });
    }
    where.userId = { in: users.map((u) => u.id) };
  }

  const fromD = parseDateParam(from, false);
  const toD = parseDateParam(to, true);
  if ((from && !fromD) || (to && !toD)) {
    return NextResponse.json({ error: '日期格式错误，请用 YYYY-MM-DD' }, { status: 400 });
  }
  if (fromD || toD) {
    where.createdAt = {
      ...(fromD ? { gte: fromD } : {}),
      ...(toD ? { lte: toD } : {}),
    };
  }

  try {
    const sessions = await prisma.chatSession.findMany({
      where,
      take: MAX_SESSIONS,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            profile: { select: { nickname: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 关键词过滤（消息内容包含即保留该会话，且只保留命中的消息）
    let finalSessions = sessions;
    if (keyword) {
      const kw = keyword.toLowerCase();
      finalSessions = sessions
        .map((s) => ({
          ...s,
          messages: s.messages.filter((m) => m.content.toLowerCase().includes(kw)),
        }))
        .filter((s) => s.messages.length > 0);
    }

    if (finalSessions.length === 0) {
      return NextResponse.json({ error: '没有匹配的聊天记录' }, { status: 404 });
    }

    // ---------- 组装 Markdown ----------
    const parts: string[] = [];
    const now = new Date();
    parts.push(`# 聊天记录导出\n`);
    parts.push(`导出时间：${fmtDate(now)}\n`);
    const filters: string[] = [];
    if (mentor) filters.push(`导师：${mentorDisplayName(mentor)}`);
    if (userParam) filters.push(`用户：${userParam}`);
    if (fromD) filters.push(`起始：${from}`);
    if (toD) filters.push(`截止：${to}`);
    if (keyword) filters.push(`关键词："${keyword}"`);
    parts.push(`筛选条件：${filters.length > 0 ? filters.join('　|　') : '全部'}\n`);
    parts.push(`会话数：${finalSessions.length}\n`);
    parts.push(`---\n`);

    for (const s of finalSessions) {
      const u = s.user;
      const userName = u?.profile?.nickname || u?.name || u?.phone || u?.email || '未知用户';
      const userContact = u?.phone || u?.email || '无联系方式';

      parts.push(`\n## 会话：${userName} × ${mentorDisplayName(s.mentorId)}\n`);
      parts.push(`用户标识：${userContact}\n`);
      parts.push(`会话创建：${fmtDate(new Date(s.createdAt))}\n`);
      parts.push(`最后更新：${fmtDate(new Date(s.updatedAt))}\n`);
      parts.push(`消息数：${s.messages.length}\n`);
      if (s.title) parts.push(`会话标题：${s.title}\n`);
      parts.push(`---\n`);

      for (const m of s.messages) {
        parts.push(formatMessage(m) + '\n');
      }
      parts.push(`---\n`);
    }

    parts.push(FIELD_NOTES);
    const markdown = parts.join('\n');

    // ---------- 以附件形式返回 ----------
    const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 19);
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="chat-export-${stamp}.md"`,
      },
    });
  } catch (error) {
    console.error('Export chat md error:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
