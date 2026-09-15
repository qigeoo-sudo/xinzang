import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { proxyFetch } from '@/lib/proxy-fetch';

/**
 * 注册/档案文本字段 AI 审核
 *
 * 前端在翻页或提交前调用，将当前页的文本字段一并发给 DeepSeek 判断。
 * 本地迷你词库做即时检查（打字时），这里做提交/翻页前的二次审核。
 *
 * 请求体：{ fields: { nickname?: string, school?: string, careerAnxiety?: string, helpPriorityOther?: string, mentorPrefOther?: string } }
 * 响应：{ pass: true } 或 { pass: false, field: "字段名", reason: "简要原因" }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.fields || typeof body.fields !== 'object') {
    return NextResponse.json({ error: '参数不合法' }, { status: 400 });
  }

  const fields = body.fields as Record<string, string>;
  // 只检查非空字段
  const entries = Object.entries(fields).filter(([, v]) => v && v.trim());
  if (entries.length === 0) {
    return NextResponse.json({ pass: true });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  if (!apiKey) {
    // 无 API Key 时放行，不阻断注册流程
    return NextResponse.json({ pass: true });
  }

  // 构造审核 prompt
  const items = entries.map(([k, v], i) => `[${i}] 字段${k}：${v}`).join('\n');
  const systemPrompt = `你是内容审核助手。判断以下用户输入的文本是否包含不合规内容（色情、暴力、侮辱谩骂、违法犯罪、人身攻击）。
对每条文本逐一判断。如果全部合规，返回 {"pass":true}。
如果有任何一条不合规，返回 {"pass":false,"field":"不合规的字段名","reason":"简要原因，10字以内"}。
只返回 JSON，不要有其他文字。`;

  try {
    const resp = await proxyFetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: items },
        ],
        temperature: 0,
        max_tokens: 100,
      }),
    });

    if (!resp.ok) {
      // API 故障时放行，不阻断注册
      return NextResponse.json({ pass: true });
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    // 提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ pass: true });
    }
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch {
    // 任何异常都放行，不阻断注册
    return NextResponse.json({ pass: true });
  }
}
