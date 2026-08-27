'use client';

import { useState, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { linkifyMentorNames } from '@/lib/mentor-links';

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  h1: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold text-base mb-1">{children}</h3>,
  h2: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold text-base mb-1">{children}</h3>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold text-sm mb-1">{children}</h3>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-2 border-slate-200 pl-2 text-slate-600">{children}</blockquote>,
  code: ({ children }: { children?: React.ReactNode }) => <code className="bg-slate-100 rounded px-1 py-0.5 text-xs">{children}</code>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">{children}</a>,
  hr: () => <hr className="border-slate-200 my-2" />,
};

function renderMarkdownContent(content: string, enableMentorLinks: boolean) {
  if (enableMentorLinks) {
    return linkifyMentorNames(content);
  }
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>;
}

/**
 * 长消息折叠组件
 * - 超过一屏80%高度时，折叠为4行 + 省略号 + "展开"链接
 * - 点击"展开"打开全屏遮罩层显示完整内容
 * - 点击遮罩层或关闭按钮关闭
 * - assistant 消息支持 markdown 渲染，user 消息纯文本
 */
export function CollapsibleText({
  content,
  isUser,
  enableMentorLinks = false,
}: {
  content: string;
  isUser: boolean;
  enableMentorLinks?: boolean;
}) {
  const [shouldCollapse, setShouldCollapse] = useState(false);
  const [showFullView, setShowFullView] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (measureRef.current) {
      const fullHeight = measureRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      setShouldCollapse(fullHeight > viewportHeight * 0.8);
    }
  }, [content]);

  const renderContent = () => {
    if (isUser) {
      return enableMentorLinks ? linkifyMentorNames(content) : content;
    }
    return renderMarkdownContent(content, enableMentorLinks);
  };

  return (
    <>
      <div
        ref={measureRef}
        className={`break-words ${
          isUser ? 'whitespace-pre-wrap' : ''
        } ${
          shouldCollapse ? 'overflow-hidden' : ''
        }`}
        style={
          shouldCollapse
            ? {
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical' as const,
              }
            : undefined
        }
      >
        {renderContent()}
      </div>

      {shouldCollapse && (
        <button
          onClick={() => setShowFullView(true)}
          className={`text-xs mt-1 transition-colors ${
            isUser ? 'text-white/70 hover:text-white/90' : 'text-brand-500 hover:text-brand-600'
          }`}
        >
          ...展开
        </button>
      )}

      {showFullView && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto"
          onClick={() => setShowFullView(false)}
        >
          <div
            className="bg-white rounded-2xl mx-4 mt-16 mb-16 p-5 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <span className="text-sm font-medium text-slate-600">完整内容</span>
              <button
                onClick={() => setShowFullView(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="关闭"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-sm leading-relaxed text-slate-800">
              {renderContent()}
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowFullView(false)}
                className="w-full py-2.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
