/**
 * 生产环境聊天记录导出脚本（在 Docker 容器内运行）
 *
 * 部署位置：宿主机 /opt/xinzang-data/export-md.cjs（容器内 /app/data/export-md.cjs）
 * 运行方式：docker exec -e DATABASE_URL=file:/app/data/prod.db xinzang node /app/data/export-md.cjs
 *
 * 可选环境变量：
 *   DAYS=N          只导出最近 N 天（不设则导出全部）
 *   ONLY_MENTOR=id  只导出某一位导师（如 lydia）
 *
 * 输出：/app/data/export/latest/{mentorId}.md，每位导师一个文件
 * 只读数据库，不修改任何业务数据。
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('/app/src/generated/prisma');

const prisma = new PrismaClient();

// 导师 ID → 中文名（仅用于文件标题；占位导师即便出现也按 ID 输出）
const MENTOR_NAMES = {
  lydia: 'Lydia Chen（HRVP）',
  winnie: 'Winnie Ni（HR/心理咨询）',
  tina: 'Tina Zhang（HR负责人）',
  james: 'James Chen（AI产品经理）',
  sarah: 'Sarah Wang（投行VP）',
  marcus: 'Marcus Liu（管理咨询）',
  lily: 'Lily Zhang（创业者）',
  david: 'David Kim（技术总监）',
  emma: 'Emma Zhou（品牌总监）',
  kevin: 'Kevin Wu（全栈工程师）',
  grace: 'Grace Li（临床研究经理）',
  tony: 'Tony Ma（运营总监）',
};

const OUT_DIR = '/app/data/export/latest';

// 时间格式化为北京时间（容器默认 UTC）
function fmt(d) {
  const bj = new Date(new Date(d).getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`;
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

function formatMessage(m) {
  const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '导师分身' : '系统';
  let line = `**${role}**　${fmt(m.createdAt)}\n\n${m.content}\n`;
  if (m.role === 'assistant') {
    const notes = [];
    let cardIds = '无';
    if (m.hitCardIds) {
      try {
        const parsed = JSON.parse(m.hitCardIds);
        if (Array.isArray(parsed) && parsed.length > 0) cardIds = parsed.join('、');
      } catch {}
    }
    notes.push(`命中知识卡：${cardIds}`);
    if (m.modelUsed) notes.push(`使用模型：${m.modelUsed}`);
    if (m.tokensUsed != null) notes.push(`消耗Token：${m.tokensUsed}`);
    line += `\n> ${notes.join('　|　')}\n`;
  }
  return line;
}

function buildMarkdown(mentorId, sessions, days) {
  const mentorName = MENTOR_NAMES[mentorId] || mentorId;
  const parts = [];
  parts.push(`# ${mentorName} 聊天记录导出\n`);
  parts.push(`导出时间：${fmt(new Date())}（北京时间）\n`);
  parts.push(`范围：${days ? `最近 ${days} 天` : '全部历史'}\n`);
  parts.push(`会话数：${sessions.length}\n`);
  parts.push(`---\n`);

  for (const s of sessions) {
    const u = s.user;
    const userName = u?.profile?.nickname || u?.name || u?.phone || u?.email || '未知用户';
    const contact = u?.phone || u?.email || '无联系方式';
    parts.push(`\n## 会话：${userName} × ${mentorName}\n`);
    parts.push(`用户标识：${contact}\n`);
    parts.push(`会话创建：${fmt(s.createdAt)}\n`);
    parts.push(`最后更新：${fmt(s.updatedAt)}\n`);
    parts.push(`消息数：${s.messages.length}\n`);
    if (s.title) parts.push(`会话标题：${s.title}\n`);
    parts.push(`---\n`);
    for (const m of s.messages) parts.push(formatMessage(m) + '\n');
    parts.push(`---\n`);
  }
  parts.push(FIELD_NOTES);
  return parts.join('\n');
}

async function main() {
  const days = parseInt(process.env.DAYS || '0', 10) || 0;
  const onlyMentor = (process.env.ONLY_MENTOR || '').trim();

  const where = {};
  if (onlyMentor) where.mentorId = onlyMentor;
  if (days > 0) where.createdAt = { gte: new Date(Date.now() - days * 86400 * 1000) };

  const sessions = await prisma.chatSession.findMany({
    where,
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      user: {
        select: {
          name: true,
          phone: true,
          email: true,
          profile: { select: { nickname: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 按导师分组
  const groups = {};
  for (const s of sessions) {
    if (s.messages.length === 0) continue;
    (groups[s.mentorId] = groups[s.mentorId] || []).push(s);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const mentorIds = Object.keys(groups).sort();
  if (mentorIds.length === 0) {
    console.log('RESULT no-sessions');
    console.log('OUTDIR ' + OUT_DIR);
    await prisma.$disconnect();
    return;
  }

  for (const id of mentorIds) {
    const md = buildMarkdown(id, groups[id], days);
    const file = path.join(OUT_DIR, `${id}.md`);
    fs.writeFileSync(file, md, 'utf-8');
    console.log(`RESULT file=${id}.md sessions=${groups[id].length} bytes=${Buffer.byteLength(md, 'utf-8')}`);
  }
  console.log('OUTDIR ' + OUT_DIR);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('EXPORT_FAIL', e.message);
  process.exit(1);
});
