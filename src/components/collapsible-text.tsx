'use client';

import { useState, useLayoutEffect, useRef } from 'react';
import { linkifyMentorNames } from '@/lib/mentor-links';

/**
 * 长消息折叠组件
 * - 超过一屏80%高度时，折叠为4行 + 省略号 + "展开"链接
 * - 点击"展开"打开全屏遮罩层显示完整内容
 * - 点击遮罩层或关闭按钮关闭
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

  // useLayoutEffect: 在浏览器绘制前测量高度，避免闪烁
  useLayoutEffect(() => {
    if (measureRef.current) {
      // scrollHeight 返回完整内容高度（即使 overflow:hidden 裁剪了）
      const fullHeight = measureRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      setShouldCollapse(fullHeight > viewportHeight * 0.8);
    }
  }, [content]);

  const renderContent = () =>
    enableMentorLinks ? linkifyMentorNames(content) : content;

  return (
    <>
      <div
        ref={measureRef}
        className={`whitespace-pre-wrap break-words ${
          shouldCollapse
            ? 'overflow-hidden'
            : ''
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

      {/* 全屏查看遮罩层 */}
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
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-800">
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
