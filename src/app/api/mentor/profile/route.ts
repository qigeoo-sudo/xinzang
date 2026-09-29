/**
 * 导师当前展示资料 — GET /api/mentor/profile
 * 返回绑定分身的当前 tags、intro、avatar（来自 mentors 配置，用于提交修改前的基线）。
 */
import { NextResponse } from 'next/server';
import { mentors } from '@/lib/mentors';
import { requireMentorContext, errorResponse } from '@/lib/mentor-console-api';

export async function GET() {
  try {
    const { mentorId } = await requireMentorContext();
    const mentor = mentors.find((m) => m.id === mentorId);
    if (!mentor) {
      return NextResponse.json({ error: '分身配置缺失' }, { status: 404 });
    }
    return NextResponse.json({
      tags: mentor.tags,
      intro: mentor.tagline,
      avatar: mentor.avatar,
      mentorName: mentor.name,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
