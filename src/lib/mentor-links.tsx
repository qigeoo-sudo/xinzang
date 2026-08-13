/**
 * 导师名称链接工具
 * 在 AI 职导的回复中，将导师名字转换为可点击的链接
 */
import React from 'react';
import Link from 'next/link';
import { mentors } from './mentors';

// 构建导师名称到 ID 的映射（包含全名和名）
const mentorNameMap = new Map<string, { id: string; name: string }>();

for (const m of mentors) {
  if (m.id === 'ai-guide') continue;
  // 全名
  mentorNameMap.set(m.name, { id: m.id, name: m.name });
  // 名（第一个单词，如 James, Sarah 等）
  const firstName = m.name.split(' ')[0];
  if (firstName.length >= 3) {
    mentorNameMap.set(firstName, { id: m.id, name: m.name });
  }
}

// 按名称长度降序排列，避免短名先匹配（如 "James" 匹配到 "James Chen" 中的 "James"）
const sortedNames = Array.from(mentorNameMap.keys()).sort((a, b) => b.length - a.length);

// 构建正则表达式，匹配导师名称（词边界）
const mentorRegex = new RegExp(
  `(${sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'g'
);

/**
 * 将文本中的导师名称转换为链接
 * 返回 React 节点数组
 */
export function linkifyMentorNames(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // 重置 regex
  mentorRegex.lastIndex = 0;

  while ((match = mentorRegex.exec(text)) !== null) {
    // 添加匹配前的文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
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

    lastIndex = match.index + matchedName.length;
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
