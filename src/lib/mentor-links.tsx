/**
 * 导师链接工具
 * linkifyMentorNames: 在纯文本中将导师名字转为链接（用于导师对话页）
 */
import React from 'react';
import Link from 'next/link';
import { mentors } from './mentors';

// 构建导师名称到 ID 的映射（包含全名和名）
const mentorNameMap = new Map<string, { id: string; name: string }>();

for (const m of mentors) {
  if (m.comingSoon) continue;
  mentorNameMap.set(m.name, { id: m.id, name: m.name });
  const firstName = m.name.split(' ')[0];
  if (firstName.length >= 3) {
    mentorNameMap.set(firstName, { id: m.id, name: m.name });
  }
}

// 按名称长度降序排列，避免短名先匹配
const sortedNames = Array.from(mentorNameMap.keys()).sort((a, b) => b.length - a.length);

const mentorRegex = new RegExp(
  `(${sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'g'
);

/**
 * 将文本中的导师名称转换为链接（用于导师对话页）
 */
export function linkifyMentorNames(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let segLastIndex = 0;
  let match: RegExpExecArray | null;

  mentorRegex.lastIndex = 0;

  while ((match = mentorRegex.exec(text)) !== null) {
    if (match.index > segLastIndex) {
      parts.push(text.slice(segLastIndex, match.index));
    }

    const matchedName = match[1];
    const mentorInfo = mentorNameMap.get(matchedName);

    if (mentorInfo) {
      parts.push(
        <Link
          key={`${match.index}-${mentorInfo.id}`}
          href={`/mentors/${mentorInfo.id}`}
          className="text-brand-500 underline decoration-brand-300 hover:text-brand-600 font-medium"
        >
          {matchedName}
        </Link>
      );
    } else {
      parts.push(matchedName);
    }

    segLastIndex = match.index + matchedName.length;
  }

  if (segLastIndex < text.length) {
    parts.push(text.slice(segLastIndex));
  }

  return parts;
}
