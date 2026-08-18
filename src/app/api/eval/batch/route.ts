/**
 * 批量评测接口 — 供 ChatGPT 内测批量问答
 *
 * POST /api/eval/batch — 提交批量任务（专用 token 认证）
 *   body: { token, mentorId?, questions[] } 或 { token, items:[{mentorId?, question}] }
 *   return: { taskId, total }
 *
 * GET /api/eval/batch?taskId=xxx — 查询进度与结果（JSON）
 *   return: { status, total, completed, results[] }
 *
 * GET /api/eval/batch?taskId=xxx&format=markdown — 导出结果文档（Markdown 文本）
 *
 * 复用导师人格 + 知识库检索（buildSystemPrompt / searchKnowledge），
 * 未来更新导师知识库与 prompt 后本接口自动生效。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMentorById, buildSystemPrompt, searchKnowledge } from '@/lib/mentors';
import type { KnowledgeEntry } from '@/lib/mentors';
import { proxyFetch } from '@/lib/proxy-fetch';

// 单次任务题目上限，防止滥用
const MAX_QUESTIONS = 500;
// 并发数（DeepSeek 限流考虑）
const CONCURRENCY = 3;

interface EvalResult {
  index: number;
  mentorId: string;
  question: string;
  answer: string;
  knowledge: { category: string; content: string }[];
  tokensUsed?: number;
  modelUsed?: string;
  durationMs: number;
  error?: string;
}

interface EvalTask {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  completed: number;
  mentorId: string;
  items: { mentorId?: string; question: string }[];
  results: EvalResult[];
  createdAt: number;
  error?: string;
}

// 内存任务表（Docker 常驻进程）
const tasks = new Map<string, EvalTask>();

function stripStageDirections(text: string): string {
  return text.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
}

function extractKnowledge(entries: KnowledgeEntry[]): { category: string; content: string }[] {
  return entries.map((e) => ({ category: e.category, content: e.content }));
}

/** 调用 AI 回答单道题 */
async function runOneQuestion(mentorId: string, question: string): Promise<Omit<EvalResult, 'index'>> {
  const start = Date.now();
  const mentor = getMentorById(mentorId);
  if (!mentor) {
    return {
      mentorId,
      question,
      answer: '',
      knowledge: [],
      durationMs: Date.now() - start,
      error: `导师不存在: ${mentorId}`,
    };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'deepseek-chat';
  const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';

  if (!apiKey) {
    return {
      mentorId,
      question,
      answer: '',
      knowledge: [],
      durationMs: Date.now() - start,
      error: '未配置 API Key',
    };
  }

  const systemPrompt = buildSystemPrompt(mentor, question);
  const knowledge = extractKnowledge(searchKnowledge(mentor, question));

  try {
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
          { role: 'user', content: question },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => 'unreadable');
      return {
        mentorId,
        question,
        answer: '',
        knowledge,
        durationMs: Date.now() - start,
        error: `AI API ${aiResponse.status}: ${errText.slice(0, 200)}`,
      };
    }

    const aiData = await aiResponse.json();
    const answer = stripStageDirections(
      aiData.choices?.[0]?.message?.content || ''
    );

    return {
      mentorId,
      question,
      answer,
      knowledge,
      tokensUsed: aiData.usage?.total_tokens,
      modelUsed: model,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      mentorId,
      question,
      answer: '',
      knowledge,
      durationMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 后台处理任务（有限并发） */
async function processTask(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  task.status = 'running';

  let next = 0;
  async function worker() {
    while (next < task!.total) {
      const idx = next++;
      const item = task!.items[idx];
      const mentorId = item.mentorId || task!.mentorId;
      const result = await runOneQuestion(mentorId, item.question);
      task!.results[idx] = { index: idx, ...result };
      task!.completed++;
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    task.status = 'done';
  } catch (e) {
    task.status = 'failed';
    task.error = e instanceof Error ? e.message : String(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const expectedToken = process.env.EVAL_API_TOKEN;
    if (!expectedToken) {
      return NextResponse.json({ error: '服务未配置 EVAL_API_TOKEN' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    if (!body || body.token !== expectedToken) {
      return NextResponse.json({ error: '无效的 token' }, { status: 401 });
    }

    // 解析题目：优先 items，其次 mentorId + questions
    let items: { mentorId?: string; question: string }[] = [];
    let defaultMentorId = 'lydia';

    if (Array.isArray(body.items)) {
      items = body.items
        .filter((it: any) => it && typeof it.question === 'string' && it.question.trim())
        .map((it: any) => ({
          mentorId: it.mentorId,
          question: String(it.question).trim(),
        }));
      defaultMentorId = body.mentorId || 'lydia';
    } else if (Array.isArray(body.questions)) {
      defaultMentorId = body.mentorId || 'lydia';
      items = body.questions
        .filter((q: any) => typeof q === 'string' && q.trim())
        .map((q: any) => ({ question: String(q).trim() }));
    }

    if (items.length === 0) {
      return NextResponse.json({ error: '未提供有效题目（questions 或 items）' }, { status: 400 });
    }
    if (items.length > MAX_QUESTIONS) {
      return NextResponse.json(
        { error: `题目数超过上限 ${MAX_QUESTIONS}` },
        { status: 400 }
      );
    }

    // 校验导师存在
    const mentorIds = new Set(items.map((it) => it.mentorId || defaultMentorId));
    for (const id of mentorIds) {
      if (!getMentorById(id)) {
        return NextResponse.json({ error: `导师不存在: ${id}` }, { status: 400 });
      }
    }

    const taskId = crypto.randomUUID();
    tasks.set(taskId, {
      id: taskId,
      status: 'running',
      total: items.length,
      completed: 0,
      mentorId: defaultMentorId,
      items,
      results: new Array(items.length),
      createdAt: Date.now(),
    });

    // 后台异步处理
    processTask(taskId).catch((e) => {
      const t = tasks.get(taskId);
      if (t) {
        t.status = 'failed';
        t.error = e instanceof Error ? e.message : String(e);
      }
    });

    return NextResponse.json({ taskId, total: items.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '服务器错误' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId');
  const format = request.nextUrl.searchParams.get('format');

  if (!taskId) {
    return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });
  }

  const task = tasks.get(taskId);
  if (!task) {
    return NextResponse.json({ error: '任务不存在或已过期' }, { status: 404 });
  }

  if (format === 'markdown') {
    const md = buildMarkdown(task);
    return new NextResponse(md, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  return NextResponse.json({
    taskId: task.id,
    status: task.status,
    total: task.total,
    completed: task.completed,
    mentorId: task.mentorId,
    error: task.error,
    results: task.results.filter((r) => r != null),
  });
}

function buildMarkdown(task: EvalTask): string {
  const lines: string[] = [];
  lines.push('# 批量评测结果');
  lines.push('');
  lines.push(`- 任务 ID: ${task.id}`);
  lines.push(`- 默认导师: ${task.mentorId}`);
  lines.push(`- 题目总数: ${task.total}`);
  lines.push(`- 完成状态: ${task.status} (${task.completed}/${task.total})`);
  lines.push('');

  for (const r of task.results) {
    if (!r) continue;
    lines.push(`## 第 ${r.index + 1} 题`);
    lines.push('');
    lines.push(`**导师**: ${r.mentorId}`);
    lines.push('');
    lines.push(`**问题**: ${r.question}`);
    lines.push('');
    if (r.error) {
      lines.push(`**错误**: ${r.error}`);
    } else {
      lines.push(`**回答**: ${r.answer}`);
    }
    if (r.knowledge && r.knowledge.length > 0) {
      lines.push('');
      lines.push('**命中知识库**:');
      for (const k of r.knowledge) {
        lines.push(`- [${k.category}] ${k.content}`);
      }
    }
    if (r.tokensUsed != null) {
      lines.push('');
      lines.push(`_tokens: ${r.tokensUsed} | model: ${r.modelUsed} | ${r.durationMs}ms_`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
