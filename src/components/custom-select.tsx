'use client';

import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  clearable?: boolean;
  disabled?: boolean;
}

export function CustomSelect({ value, onChange, options, placeholder = '请选择', className = '', clearable = false, disabled = false }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label || '';

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      const idx = options.findIndex((o) => o.value === value);
      setHighlightedIndex(idx >= 0 ? idx : -1);
      requestAnimationFrame(() => {
        if (listRef.current && idx >= 0) {
          const item = listRef.current.children[idx] as HTMLElement;
          if (item) item.scrollIntoView({ block: 'center' });
        }
      });
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault();
        onChange(options[highlightedIndex].value);
        setOpen(false);
      }
    }
    if (open) document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [open, highlightedIndex, options, onChange]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const selectedIndex = options.findIndex((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`input-field w-full text-left flex items-center justify-between disabled:opacity-45 disabled:cursor-not-allowed ${className}`}
      >
        <span className={selectedLabel ? 'text-ink truncate' : 'text-muted truncate'}>
          {selectedLabel || placeholder}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {open && (
        <>
          {/* 遮罩：半透明全屏，覆盖 footer 等底部内容，点击外部关闭 */}
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* 弹层：手机=全屏底部抽屉；桌面=依附输入框的浮层，宽随输入框/最大360px，高≤320px */}
          <div className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[60vh] flex-col rounded-t-2xl bg-white shadow-2xl md:absolute md:bottom-auto md:top-full md:left-0 md:right-0 md:mt-2 md:max-h-[320px] md:max-w-[360px] md:rounded-xl">
            {/* 手机端标题栏 */}
            <div className="flex items-center justify-between border-b border-rule px-4 py-3 md:hidden">
              <span className="text-sm font-medium text-ink">{placeholder}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                关闭
              </button>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full px-4 py-3 text-left text-sm border-b border-rule/30 flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'text-accent font-medium bg-sand-50'
                        : highlightedIndex === idx
                          ? 'bg-sand-50 text-ink'
                          : 'text-ink'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            {/* 手机端底部操作栏 */}
            <div className="flex gap-3 border-t border-rule px-4 py-3 md:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => { onChange(''); setOpen(false); }}
                  className="flex-1 py-2.5 text-sm text-center text-coral-700 bg-coral-50 rounded-lg hover:bg-coral-100 transition-colors"
                >
                  清除选择
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 text-sm text-center text-ink bg-sand-50 rounded-lg hover:bg-sand-100 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
