/**
 * 职业兴趣测评结果解释 API
 * POST /api/assessment/explain
 * body: { code: string; scores: Record<string, number> }
 *
 * 调用 LLM 结合 RIASEC 代码 + 职业映射表，生成约150字的职业规划师口吻解释
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { fetchWithRetry } from '@/lib/ai-retry';
import { DIMENSIONS, DIMENSION_META, type Dimension } from '@/lib/riasec/questions';
import { matchJobsByCode } from '@/lib/riasec/jobs';

const ALLOWED_API_URLS = [
  'https://api.deepseek.com',
  'https://api.openai.com',
  'https://api.moonshot.cn',
];

// 违禁词列表：生成内容中不允许出现这些词
const FORBIDDEN_WORDS = ['拆', '绕', '不是', '而是'];

/** 后处理：过滤违禁词，替换为同义表达 */
function sanitizeOutput(text: string): string {
  let out = text;
  // "不是……而是" 句式：整体替换为中性表达
  out = out.replace(/不是[^。！？\n]{0,30}而是/g, (m) => {
    // 去掉"不是"和"而是"，保留中间内容
    return m.replace(/不是/g, '').replace(/而是/g, '，即');
  });
  // 单独的"拆""绕"替换
  out = out.replace(/拆/g, '分').replace(/绕/g, '围绕');
  return out.trim();
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const { code, scores } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '缺少兴趣代码' }, { status: 400 });
    }

    // 匹配推荐职业（1~3个）
    const matchedJobs = matchJobsByCode(code, 3);

    // 构建维度说明
    const dimParts = code.split('').map((d) => {
      const meta = DIMENSION_META[d as Dimension];
      return meta ? `${d}（${meta.name}）` : d;
    });

    // 分数描述
    const ranked = DIMENSIONS.slice().sort(
      (a, b) => (scores?.[b] ?? 0) - (scores?.[a] ?? 0)
    );
    const topDims = ranked.slice(0, 3).map(
      (d) => `${DIMENSION_META[d].name}${scores?.[d] ?? 0}分`
    );

    const jobsText = matchedJobs.length
      ? matchedJobs.map((j) => `${j.jobCn}（${j.industry}，入门：${j.entryPath}）`).join('、')
      : '暂无精确匹配';

    const systemPrompt = `你是一位资深职业规划师。请根据用户的 RIASEC 职业兴趣测试结果，写一段约150字的解释。

【硬性要求，必须严格遵守】
1. 口吻：专业、温和、有同理心，像一位经验丰富的职业规划师在面谈
2. 字数：控制在130~170字之间
3. 结构：先点出兴趣代码代表的核心特质，再结合推荐职业给出方向建议
4. 绝对禁止出现以下字词："拆"、"绕"、"不是"、"而是"。不得使用"不是……而是"句式。
5. 不得使用感叹号过多，语气平实可信
6. 只输出解释正文，不要加标题、引号或前缀

【用户数据】
兴趣代码：${code}（${dimParts.join(' · ')}）
得分前三：${topDims.join('、')}
推荐职业：${jobsText}`;

    const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
    const baseUrl = apiUrl.replace(/\/v\d+\/?$/, '');
    if (!ALLOWED_API_URLS.includes(baseUrl)) {
      return NextResponse.json({ error: '服务配置错误' }, { status: 500 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const model = process.env.AI_MODEL || 'deepseek-chat';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI 服务未配置' },
        { status: 503 }
      );
    }

    const aiResponse = await fetchWithRetry(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.6,
        max_tokens: 400,
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text().catch(() => '');
      console.error('Assessment explain AI error:', aiResponse.status, errorBody.slice(0, 300));
      return NextResponse.json(
        { error: 'AI 生成失败，请稍后再试' },
        { status: 502 }
      );
    }

    const data = await aiResponse.json();
    let explanation =
      data?.choices?.[0]?.message?.content?.trim() ||
      '你的兴趣组合反映出独特的职业倾向，建议结合推荐职业方向进一步探索。';

    // 后处理：过滤违禁词
    explanation = sanitizeOutput(explanation);

    // 存库：供导师分身聊天时作为前置背景知识
    try {
      await prisma.interestAssessment.update({
        where: { userId: session.user.id },
        data: {
          explanation,
          recommendedJobs: matchedJobs.length
            ? JSON.stringify(matchedJobs.map((j) => j.jobCn))
            : null,
        },
      });
    } catch (e) {
      console.error('Save assessment explanation failed:', e);
    }

    return NextResponse.json({
      explanation,
      jobs: matchedJobs.map((j) => ({
        jobCn: j.jobCn,
        industry: j.industry,
        entryPath: j.entryPath,
      })),
    });
  } catch (error) {
    console.error('Assessment explain error:', error);
    return NextResponse.json(
      { error: '解释生成失败，请稍后再试' },
      { status: 500 }
    );
  }
}
