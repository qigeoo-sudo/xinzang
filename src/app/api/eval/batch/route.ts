/**
 * 批量评测接口（新架构）— 导师分身批量问答 + 自动评分
 *
 * 走三层 Prompt 新架构：平台硬约束 + 导师人格 + 专业知识总调度（数据库知识卡检索 + LLM judge）。
 * 结果写入 MentorEvalRun / MentorEvalResult。
 *
 * POST /api/eval/batch
 *   body: { token?, mentorId?, questions?: [{test_id, category, question, expected_behavior}] }
 *   缺省 questions 时按 mentorId 选择内置题库：Lydia 或 Winnie。
 *   return: { runId, summary }
 *
 * GET /api/eval/batch?runId=xxx&token=yyy
 *   return: { run, results[] }
 *
 * 认证：若环境变量 EVAL_TOKEN 已配置则必须匹配，否则允许本地调用。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runEvalBatch, type EvalQuestion } from '@/lib/eval-core';
import { LYDIA_EVAL_V2 } from '@/lib/lydia-eval-v2';
import { WINNIE_EVAL_V1 } from '@/lib/winnie-eval-v1';

function authorized(bodyToken?: string | null, queryToken?: string | null): boolean {
  const expected = process.env.EVAL_TOKEN;
  if (!expected) return true; // 未配置则允许（本地/内部）
  const given = bodyToken ?? queryToken ?? '';
  return given === expected;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!authorized(body?.token ?? null)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const mentorId = body?.mentorId || 'lydia';
    const defaultQuestions = mentorId === 'winnie' ? WINNIE_EVAL_V1 : LYDIA_EVAL_V2;
    const questions: EvalQuestion[] =
      body?.questions && Array.isArray(body.questions) && body.questions.length > 0
        ? body.questions
        : defaultQuestions;

    const scope = body?.scope || 'api-batch';

    const summary = await runEvalBatch({
      mentorId,
      questions,
      scope,
      concurrency: body?.concurrency || 3,
      testMode: body?.testMode !== false,
    });

    return NextResponse.json({ runId: summary.runId, summary });
  } catch (e) {
    console.error('Eval batch error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '评测失败' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const token = searchParams.get('token');

    if (!authorized(null, token)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    if (!runId) {
      const runs = await prisma.mentorEvalRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return NextResponse.json({ runs });
    }

    const run = await prisma.mentorEvalRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: 'run 不存在' }, { status: 404 });
    }

    const results = await prisma.mentorEvalResult.findMany({
      where: { runId },
      orderBy: { testId: 'asc' },
    });

    return NextResponse.json({ run, results });
  } catch (e) {
    console.error('Eval query error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
