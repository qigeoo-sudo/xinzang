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
}

export function CustomSelect({ value, onChange, options, placeholder = '请选择', className = '' }: CustomSelectProps) {
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
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`input-field w-full text-left flex items-center justify-between ${className}`}
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
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: '60vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
              <span className="text-sm font-medium text-ink">{placeholder}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                关闭
              </button>
            </div>
            <div ref={listRef} className="overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
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
            <div className="px-4 py-3 border-t border-rule" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-2.5 text-sm text-center text-ink bg-sand-50 rounded-lg hover:bg-sand-100 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
