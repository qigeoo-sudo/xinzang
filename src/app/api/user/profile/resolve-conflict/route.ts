/**
 * 档案冲突解决 API
 * POST /api/user/profile/resolve-conflict
 * body: { field: string, choice: 'confirmed' | 'inferred' }
 *
 * 用户对「已确认 vs 推断」冲突选择保留哪一个版本：
 * - confirmed：保留已确认值，丢弃推断
 * - inferred：采用推断值写入主列，丢弃推断暂存
 *
 * 修复: 增加字段白名单校验，防止原型污染或越权
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveProfileConflict } from '@/lib/profile-inference';

// 允许的字段白名单（与 profile-inference.ts ALIGNABLE_FIELDS 对齐）
const ALLOWED_FIELDS = new Set([
  'status', 'city', 'school', 'major', 'enrollmentYear',
  'industry', 'companyType', 'gradYears', 'goals',
  'interests', 'careerAnxiety', 'jobChangeStatus',
]);

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const field = body?.field;
    const choice = body?.choice;

    if (typeof field !== 'string' || !field) {
      return NextResponse.json({ error: '缺少字段名' }, { status: 400 });
    }
    // 字段白名单校验
    if (!ALLOWED_FIELDS.has(field)) {
      return NextResponse.json({ error: '无效的字段名' }, { status: 400 });
    }
    if (choice !== 'confirmed' && choice !== 'inferred') {
      return NextResponse.json({ error: 'choice 必须为 confirmed 或 inferred' }, { status: 400 });
    }

    await resolveProfileConflict(session.user.id, field, choice);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Resolve conflict error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: '解决冲突失败，请稍后再试' },
      { status: 500 }
    );
  }
}
