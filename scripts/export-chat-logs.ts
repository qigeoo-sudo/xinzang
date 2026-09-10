/**
 * 聊天记录导出工具 — 按时间/导师/用户/关键词筛选，输出通俗易读的 Markdown
 *
 * 用法:
 *   npx tsx scripts/export-chat-logs.ts                              # 导出全部对话
 *   npx tsx scripts/export-chat-logs.ts --mentor lydia               # 只看 Lydia
 *   npx tsx scripts/export-chat-logs.ts --user 手机号或邮箱            # 只看某用户
 *   npx tsx scripts/export-chat-logs.ts --from 2026-09-01 --to 2026-09-10  # 按日期范围
 *   npx tsx scripts/export-chat-logs.ts --keyword 简历                 # 按关键词搜索
 *   npx tsx scripts/export-chat-logs.ts --mentor lydia --keyword 简历  # 组合筛选
 *
 * 输出:
 *   在项目根目录下生成 outbox/chat-export-{时间戳}.md
 *
 * 说明:
 *   - 只读本地 SQLite 数据库，不调用任何外部 API
 *   - hitCardIds、modelUsed 等技术字段在每轮对话后附注通俗解释
 *   - 仅供内部复盘，不对外发布
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ---------- 环境变量加载（必须在 PrismaClient 之前） ----------
function loadEnv() {
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
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

// DATABASE_URL 兜底：如果环境变量没设，尝试 zeroworld 的 dev.db
if (!process.env.DATABASE_URL) {
  const zeroworldDb = 'C:/Users/bingw/zeroworld/xinzang/prisma/dev.db';
  if (existsSync(zeroworldDb)) {
    process.env.DATABASE_URL = `file:${zeroworldDb}`;
  }
}

// ---------- 加载 PrismaClient（优先用本项目的 generated，兜底 zeroworld） ----------
function loadPrisma(): any {
  const candidates = [
    resolve(process.cwd(), 'src/generated/prisma'),
    'C:/Users/bingw/zeroworld/xinzang/src/generated/prisma',
  ];
  for (const dir of candidates) {
    const indexPath = resolve(dir, 'index.js');
    if (existsSync(indexPath)) {
      try {
        const mod = require(indexPath);
        return new mod.PrismaClient();
      } catch {
        try {
          const mod = require(indexPath);
          return new mod.default.PrismaClient();
        } catch {}
      }
    }
  }
  console.error('找不到 PrismaClient。请先在项目目录运行 npx prisma generate');
  process.exit(1);
}

const prisma = loadPrisma();

// ---------- 导师 ID → 可读名称 ----------
const MENTOR_NAMES: Record<string, string> = {
  'ai-guide': '榨职机（AI职导）',
  'lydia': 'Lydia Chen（HRVP）',
  'winnie': 'Winnie Ni（HR/心理咨询）',
  'tina': 'Tina Zhang（HR负责人）',
  'james': 'James Chen（AI产品经理）',
  'sarah': 'Sarah Wang（投行VP）',
  'marcus': 'Marcus Liu（管理咨询）',
  'lily': 'Lily Zhang（创业者）',
  'david': 'David Kim（技术总监）',
  'emma': 'Emma Zhou（品牌总监）',
  'kevin': 'Kevin Wu（全栈工程师）',
  'grace': 'Grace Li（临床研究经理）',
  'tony': 'Tony Ma（运营总监）',
};

// ---------- 解析命令行参数 ----------
interface Args {
  mentor?: string;
  user?: string;       // 手机号或邮箱
  from?: string;       // YYYY-MM-DD
  to?: string;         // YYYY-MM-DD
  keyword?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mentor' && args[i + 1]) { result.mentor = args[++i]; continue; }
    if (args[i] === '--user' && args[i + 1]) { result.user = args[++i]; continue; }
    if (args[i] === '--from' && args[i + 1]) { result.from = args[++i]; continue; }
    if (args[i] === '--to' && args[i + 1]) { result.to = args[++i]; continue; }
    if (args[i] === '--keyword' && args[i + 1]) { result.keyword = args[++i]; continue; }
  }
  return result;
}

// ---------- 日期格式化 ----------
function fmtDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDateOnly(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- 字段附注（通俗解释） ----------
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

- **消耗Token**：这条回复消耗的 AI 计算资源量，类似"这段对话花了多少算力"。
  数字越大说明回复越长或越复杂。
`;
// ---------- 构建查询条件 ----------
async function buildWhere(args: Args) {
  const where: any = {};

  // 导师筛选
  if (args.mentor) {
    where.mentorId = args.mentor;
  }

  // 用户筛选（手机号或邮箱）
  if (args.user) {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ phone: args.user }, { email: args.user }],
      },
      select: { id: true },
    });
    if (users.length === 0) {
      console.error(`未找到用户: ${args.user}`);
      process.exit(1);
    }
    where.userId = { in: users.map((u: { id: string }) => u.id) };
  }

  // 时间范围
  if (args.from || args.to) {
    where.createdAt = {};
    if (args.from) {
      const fromD = new Date(args.from + 'T00:00:00');
      if (isNaN(fromD.getTime())) { console.error(`--from 日期格式错误，请用 YYYY-MM-DD`); process.exit(1); }
      where.createdAt.gte = fromD;
    }
    if (args.to) {
      const toD = new Date(args.to + 'T23:59:59.999');
      if (isNaN(toD.getTime())) { console.error(`--to 日期格式错误，请用 YYYY-MM-DD`); process.exit(1); }
      where.createdAt.lte = toD;
    }
  }

  return where;
}

// ---------- 关键词过滤（在消息内容上做 LIKE） ----------
function applyKeywordFilter(sessions: any[], keyword: string): any[] {
  const kw = keyword.toLowerCase();
  return sessions.map(s => {
    const filteredMessages = s.messages.filter((m: any) =>
      m.content.toLowerCase().includes(kw)
    );
    if (filteredMessages.length === 0) return null;
    return { ...s, messages: filteredMessages, _keywordHit: true };
  }).filter(Boolean);
}

// ---------- 格式化单条消息 ----------
function formatMessage(msg: any, session: any): string {
  const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '导师分身' : '系统';
  const time = fmtDate(new Date(msg.createdAt));

  let line = `**${role}**　${time}\n\n${msg.content}\n`;

  // AI 回复附加技术标注
  if (msg.role === 'assistant') {
    const notes: string[] = [];

    // 命中知识卡
    let cardIds = '无';
    if (msg.hitCardIds) {
      try {
        const parsed = JSON.parse(msg.hitCardIds);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cardIds = parsed.join('、');
        }
      } catch {}
    }
    notes.push(`命中知识卡：${cardIds}`);

    // 使用模型
    if (msg.modelUsed) {
      notes.push(`使用模型：${msg.modelUsed}`);
    }

    // 消耗 Token
    if (msg.tokensUsed != null) {
      notes.push(`消耗Token：${msg.tokensUsed}`);
    }

    if (notes.length > 0) {
      line += `\n> ${notes.join('　|　')}\n`;
    }
  }

  return line;
}

// ---------- 主流程 ----------
async function main() {
  const args = parseArgs();

  console.log('开始查询聊天记录...');
  console.log('筛选条件:', {
    导师: args.mentor || '全部',
    用户: args.user || '全部',
    起始日期: args.from || '不限',
    截止日期: args.to || '不限',
    关键词: args.keyword || '无',
  });

  const where = await buildWhere(args);

  const sessions = await prisma.chatSession.findMany({
    where,
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
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

  console.log(`找到 ${sessions.length} 个会话`);

  // 关键词过滤
  let finalSessions = sessions;
  if (args.keyword) {
    finalSessions = applyKeywordFilter(sessions as any[], args.keyword);
    console.log(`关键词"${args.keyword}"命中 ${finalSessions.length} 个会话`);
  }

  if (finalSessions.length === 0) {
    console.log('没有匹配的聊天记录。');
    return;
  }

  // ---------- 组装 Markdown ----------
  const parts: string[] = [];

  // 文档头
  const exportTime = fmtDate(new Date());
  parts.push(`# 聊天记录导出\n`);
  parts.push(`导出时间：${exportTime}\n`);
  const filters: string[] = [];
  if (args.mentor) filters.push(`导师：${MENTOR_NAMES[args.mentor] || args.mentor}`);
  if (args.user) filters.push(`用户：${args.user}`);
  if (args.from) filters.push(`起始：${args.from}`);
  if (args.to) filters.push(`截止：${args.to}`);
  if (args.keyword) filters.push(`关键词："${args.keyword}"`);
  parts.push(`筛选条件：${filters.length > 0 ? filters.join('　|　') : '全部'}\n`);
  parts.push(`会话数：${finalSessions.length}\n`);
  parts.push(`---\n`);

  // 每个会话
  for (const session of finalSessions) {
    const user = session.user;
    const userName = user?.profile?.nickname || user?.name || user?.phone || user?.email || '未知用户';
    const userContact = user?.phone || user?.email || '无联系方式';
    const mentorName = MENTOR_NAMES[session.mentorId as string] || session.mentorId;

    parts.push(`\n## 会话：${userName} × ${mentorName}\n`);
    parts.push(`用户标识：${userContact}\n`);
    parts.push(`会话创建：${fmtDate(new Date(session.createdAt))}\n`);
    parts.push(`最后更新：${fmtDate(new Date(session.updatedAt))}\n`);
    parts.push(`消息数：${session.messages.length}\n`);

    if (session.title) {
      parts.push(`会话标题：${session.title}\n`);
    }

    parts.push(`---\n`);

    // 消息内容
    for (const msg of session.messages) {
      parts.push(formatMessage(msg, session) + '\n');
    }

    parts.push(`---\n`);
  }

  // 字段附注
  parts.push(FIELD_NOTES);

  const markdown = parts.join('\n');

  // ---------- 写入文件 ----------
  const outDir = resolve(process.cwd(), 'outbox');
  mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const outFile = resolve(outDir, `chat-export-${stamp}.md`);
  writeFileSync(outFile, markdown, 'utf-8');

  console.log(`\n导出完成！`);
  console.log(`文件路径：${outFile}`);
  console.log(`文件大小：${(markdown.length / 1024).toFixed(1)} KB`);
}

main()
  .catch((err) => {
    console.error('导出失败:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
