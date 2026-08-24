'use client';

import { useState } from 'react';
import { linkifyMentorNames } from '@/lib/mentor-links';

/**
 * 聊天交互选项组件
 * 解析 AI 回复中的 [CHOICE] 标签，渲染为可点击按钮
 * 支持三种类型：single（单选）、multi（多选）、rank（排序）
 */

export interface ChoiceOption {
  type: 'single' | 'multi' | 'rank';
  options: string[];
}

/**
 * 从消息内容中解析 [CHOICE] 标签
 * 返回：纯文本部分 + 选项部分
 */
export function parseChoiceTags(content: string): {
  textParts: string[];
  choices: ChoiceOption[];
} {
  const textParts: string[] = [];
  const choices: ChoiceOption[] = [];

  // 匹配 [CHOICE:type=xxx]...[/CHOICE] 格式
  const regex = /\[CHOICE:type=(single|multi|rank)\]([\s\S]*?)\[\/CHOICE\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index)
        .replace(/\[\/?CHOICE[^\]]*\]/gi, '')
        .trim();
      if (text) textParts.push(text);
    }

    const type = match[1] as 'single' | 'multi' | 'rank';
    const optionsText = match[2].trim();
    const options = optionsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    choices.push({ type, options });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
      .replace(/\[\/?CHOICE[^\]]*\]/gi, '')
      .trim();
    if (text) textParts.push(text);
  }

  if (choices.length === 0 && textParts.length === 0) {
    const cleaned = content.replace(/\[\/?CHOICE[^\]]*\]/gi, '').trim();
    if (cleaned) textParts.push(cleaned);
  }

  return { textParts, choices };
}

interface ChatOptionsProps {
  choice: ChoiceOption;
  onSelect: (value: string) => void;
  disabled?: boolean;
}

/**
 * 渲染单个选项组
 */
export function ChatOptions({ choice, onSelect, disabled }: ChatOptionsProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [rankOrder, setRankOrder] = useState<string[]>([]);

  if (choice.type === 'single') {
    return (
      <div className="flex flex-col gap-2 mt-3">
        {choice.options.map((option, i) => (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onSelect(option)}
            className="text-left px-4 py-2.5 rounded-xl border border-brand-200 bg-white text-sm text-brand-900 transition-all hover:bg-brand-50 hover:border-brand-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (choice.type === 'multi') {
    const toggleOption = (option: string) => {
      setSelected((prev) =>
        prev.includes(option)
          ? prev.filter((o) => o !== option)
          : [...prev, option]
      );
    };

    const handleSubmit = () => {
      if (selected.length > 0) {
        onSelect(selected.join('、'));
      }
    };

    return (
      <div className="mt-3">
        <div className="flex flex-col gap-2">
          {choice.options.map((option, i) => (
            <button
              key={i}
              disabled={disabled}
              onClick={() => toggleOption(option)}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                selected.includes(option)
                  ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium'
                  : 'border-brand-200 bg-white text-brand-900 hover:bg-brand-50 hover:border-brand-300'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                    selected.includes(option)
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'border-slate-300 text-transparent'
                  }`}
                >
                  {selected.includes(option) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {option}
              </span>
            </button>
          ))}
        </div>
        <button
          disabled={disabled || selected.length === 0}
          onClick={handleSubmit}
          className="mt-3 w-full py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium transition-all hover:bg-brand-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          确认选择（已选 {selected.length} 项）
        </button>
      </div>
    );
  }

  if (choice.type === 'rank') {
    const toggleRank = (option: string) => {
      setRankOrder((prev) => {
        if (prev.includes(option)) {
          // 取消选择及之后的所有选择
          const idx = prev.indexOf(option);
          return prev.slice(0, idx);
        }
        if (prev.length >= choice.options.length) {
          return prev;
        }
        return [...prev, option];
      });
    };

    const handleSubmit = () => {
      if (rankOrder.length === choice.options.length) {
        // 生成排序结果字符串
        const result = rankOrder
          .map((opt) => {
            const idx = choice.options.indexOf(opt);
            return idx + 1;
          })
          .join(',');
        onSelect(`排序：${rankOrder.map((o, i) => `${i + 1}.${o.replace(/^[①②③④⑤]/, '')}`).join(' ')}`);
      }
    };

    const allRanked = rankOrder.length === choice.options.length;

    return (
      <div className="mt-3">
        <p className="text-xs text-slate-400 mb-2">
          点击选项进行排序（第1次点击=最优先，依次类推）
        </p>
        <div className="flex flex-col gap-2">
          {choice.options.map((option, i) => {
            const rankIdx = rankOrder.indexOf(option);
            const isRanked = rankIdx !== -1;
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => toggleRank(option)}
                className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between ${
                  isRanked
                    ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium'
                    : 'border-brand-200 bg-white text-brand-900 hover:bg-brand-50 hover:border-brand-300'
                }`}
              >
                <span>{option}</span>
                {isRanked && (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white text-xs font-bold">
                    {rankIdx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          disabled={disabled || !allRanked}
          onClick={handleSubmit}
          className="mt-3 w-full py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium transition-all hover:bg-brand-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {allRanked ? '确认排序' : `请继续排序（${rankOrder.length}/${choice.options.length}）`}
        </button>
        {rankOrder.length > 0 && !allRanked && (
          <button
            onClick={() => setRankOrder([])}
            className="mt-2 w-full text-xs text-slate-400 hover:text-slate-500"
          >
            重新排序
          </button>
        )}
      </div>
    );
  }

  return null;
}

/**
 * 渲染包含选项的消息内容
 */
export function MessageWithChoices({
  content,
  onSelect,
  disabled,
  enableMentorLinks = false,
}: {
  content: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  enableMentorLinks?: boolean;
}) {
  const { textParts, choices } = parseChoiceTags(content);

  if (choices.length === 0) {
    return <>{enableMentorLinks ? linkifyMentorNames(content) : content}</>;
  }

  return (
    <div>
      {textParts.map((text, i) => (
        <p key={i} className="mb-2 last:mb-0 whitespace-pre-wrap">
          {enableMentorLinks ? linkifyMentorNames(text) : text}
        </p>
      ))}
      {choices.map((choice, i) => (
        <ChatOptions
          key={i}
          choice={choice}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
