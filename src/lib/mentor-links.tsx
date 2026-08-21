/**
 * 导师链接工具
 * 1. stripMentorTags: 从文本中提取 [mentor:xxx] 标记，返回纯文本 + 导师ID列表
 * 2. linkifyMentorNames: 在纯文本中将导师名字转为链接（用于导师对话页）
 */
import React from 'react';
import Link from 'next/link';
import { mentors } from './mentors';

export interface MentorInfo {
  id: string;
  name: string;
  avatar?: string;
  title: string;
  company: string;
  tagline: string;
}

// 构建导师名称到 ID 的映射（包含全名和名）
const mentorNameMap = new Map<string, { id: string; name: string }>();
// 构建 ID 到导师信息的映射
const mentorIdMap = new Map<string, MentorInfo>();

for (const m of mentors) {
  if (m.id === 'ai-guide') continue;
  mentorNameMap.set(m.name, { id: m.id, name: m.name });
  const firstName = m.name.split(' ')[0];
  if (firstName.length >= 3) {
    mentorNameMap.set(firstName, { id: m.id, name: m.name });
  }
  mentorIdMap.set(m.id, {
    id: m.id,
    name: m.name,
    avatar: m.avatar,
    title: m.title,
    company: m.company,
    tagline: m.tagline,
  });
}

// 按名称长度降序排列，避免短名先匹配
const sortedNames = Array.from(mentorNameMap.keys()).sort((a, b) => b.length - a.length);

const mentorRegex = new RegExp(
  `(${sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'g'
);

// 匹配 [mentor:xxx] 标记
const mentorTagRegex = /\[mentor:([a-z-]+)\]/g;

/**
 * 从文本中提取 [mentor:xxx] 标记
 * 返回纯文本（移除了标记）和去重后的导师信息列表
 */
export function stripMentorTags(text: string): { cleanText: string; mentors: MentorInfo[] } {
  const mentorIds: string[] = [];
  let tagMatch: RegExpExecArray | null;
  mentorTagRegex.lastIndex = 0;
  while ((tagMatch = mentorTagRegex.exec(text)) !== null) {
    if (!mentorIds.includes(tagMatch[1])) {
      mentorIds.push(tagMatch[1]);
    }
  }

  const cleanText = text.replace(mentorTagRegex, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  const mentorList = mentorIds
    .map((id) => mentorIdMap.get(id))
    .filter((m): m is MentorInfo => m !== undefined);

  return { cleanText, mentors: mentorList };
}

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
