/**
 * 档案提取 API — 已停用（旧版榨职机问卷下线的第一步）
 * POST /api/profile/extract
 *
 * 档案改由注册流程与个人档案页维护，不再从 AI 对话中提取覆盖。
 * 本文件与问卷状态机等旧代码将在后续清理中整体删除。
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: '请先登录' },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { error: '档案提取已停用，请在个人档案页直接编辑信息。' },
    { status: 410 }
  );
}
