'use client';

/**
 * 学校搜索选择器
 *
 * 数据源：src/data/universities.json（3033 所高校）
 * 交互：
 *  - 输入 ≥2 字符触发子串匹配
 *  - 候选按相似度排序（前缀优先 + 名字短的优先）
 *  - 候选末尾固定"不在名单里"选项，点击后直接采用当前输入值
 *  - 不在名单里的输入值原样保留（blur 不强制改"其他"），但离开输入框时
 *    做与昵称一致的敏感词检查，命中则红字提示
 *  - 选中后回填到父组件
 *
 * 词库模块独立 chunk，挂载后预加载；输入 2 字以下不触发搜索。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchUniversities, type UniversitySearchResult } from '@/lib/universities';

interface SchoolSearchProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  inputClassName?: string;
}

const PRELOAD_DELAY_MS = 300;
const DEBOUNCE_MS = 120;
const RESULT_LIMIT = 20;

export function SchoolSearch({
  value,
  onChange,
  placeholder = '请输入学校名称/简称',
  inputClassName,
}: SchoolSearchProps) {
  // 下拉开关
  const [open, setOpen] = useState(false);
  // 搜索结果（仅显示，不包含输入值本身）
  const [results, setResults] = useState<UniversitySearchResult[]>([]);
  // 当前高亮项索引（-1 表示未高亮；最后一项固定为"不在名单里"）
  const [highlightIdx, setHighlightIdx] = useState(-1);
  // 词库模块（动态 import）
  const modRef = useRef<typeof import('@/lib/universities') | null>(null);
  // 敏感词模块（动态 import，与昵称共用同一套词库）
  const sensitiveRef = useRef<typeof import('@/lib/sensitive-words') | null>(null);
  // 学校名称敏感词命中（blur 时检查，命中显示红字提示）
  const [blocked, setBlocked] = useState(false);
  // debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 容器 ref（点击外部关闭）
  const containerRef = useRef<HTMLDivElement>(null);
  // 上次触发搜索的输入值（避免重复搜索）
  const lastQueryRef = useRef('');
  // blur 延迟检查定时器（避免点击下拉候选时 input blur 早于 onChange 生效）
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 跟踪最新 value，避免 blur 回调闭包捕获旧值
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // 挂载后预加载 universities 模块，避免首次输入卡顿
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      import('@/lib/universities')
        .then((m) => {
          if (!cancelled) modRef.current = m;
        })
        .catch(() => {});
      import('@/lib/sensitive-words')
        .then((m) => {
          if (!cancelled) sensitiveRef.current = m;
        })
        .catch(() => {});
    }, PRELOAD_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // 输入变化时触发搜索（debounce）
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open) return;

    const q = value.trim().toLowerCase();
    if (q.length < 2) {
      setResults([]);
      setHighlightIdx(-1);
      lastQueryRef.current = '';
      return;
    }
    if (q === lastQueryRef.current) return;
    lastQueryRef.current = q;

    debounceRef.current = setTimeout(() => {
      const mod = modRef.current;
      if (!mod) return;
      const list = mod.searchUniversities(value, RESULT_LIMIT);
      setResults(list);
      setHighlightIdx(-1);
    }, DEBOUNCE_MS);
  }, [value, open]);

  // 候选项总数（含末尾"不在名单里"）
  const totalItems = useMemo(() => results.length + 1, [results.length]);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setHighlightIdx(-1);
  };

  // 离开字段时：不在名单里也保留用户输入的学校名称，仅做敏感词检查
  // （与昵称同一套词库和判定；服务端保存接口另有硬校验兜底）
  const handleBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      const v = valueRef.current.trim();
      if (!v) {
        setBlocked(false); // 空值交给表单必填校验
      } else if (sensitiveRef.current) {
        setBlocked(sensitiveRef.current.containsSensitiveWord(v));
      } else {
        // 模块还没加载完：加载后再判一次
        import('@/lib/sensitive-words')
          .then((m) => { sensitiveRef.current = m; setBlocked(m.containsSensitiveWord(v)); })
          .catch(() => {});
      }
      setOpen(false);
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || totalItems === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => (i - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      if (highlightIdx >= 0 && highlightIdx < results.length) {
        e.preventDefault();
        handleSelect(results[highlightIdx].name);
      } else if (highlightIdx === results.length) {
        // 选中"不在名单里"，采用当前输入的学校名称
        e.preventDefault();
        handleSelect(value.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIdx(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setBlocked(false); // 打字过程先清除提示，blur 后再判
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />
      {open && value.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-[10px] border border-[#E8B5B5] shadow-lg max-h-64 overflow-y-auto">
          {results.length === 0
            ? null
            : results.map((u, idx) => (
              <button
                key={`${u.name}-${idx}`}
                type="button"
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // 阻止 input blur，确保 handleSelect 先生效
                  handleSelect(u.name);
                }}
                className={`w-full text-left px-4 py-2 text-[14px] flex justify-between items-center transition-colors ${
                  highlightIdx === idx ? 'bg-[#FDF5EC] text-[#D4881A]' : 'bg-white text-[#2C3E5C] hover:bg-[#FDF5EC]'
                }`}
              >
                <span>{u.name}</span>
                <span className="text-[11px] text-[#B6A89C]">{u.province}</span>
              </button>
            ))
          }
          {/* 末尾固定"不在名单里"选项：直接采用当前输入的学校名称 */}
          <button
            type="button"
            onMouseEnter={() => setHighlightIdx(results.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelect(value.trim());
            }}
            className={`w-full text-left px-4 py-2 text-[14px] border-t border-[#F2E6D8] transition-colors ${
              highlightIdx === results.length
                ? 'bg-[#FDF5EC] text-[#D4881A]'
                : 'bg-white text-[#7D9471] hover:bg-[#FDF5EC]'
            }`}
          >
            {value.trim() ? '不在名单里：使用输入的学校名称' : '不在名单里'}
          </button>
        </div>
      )}
      {blocked && (
        <p className="mt-1.5 text-xs text-red-500">学校名称含违规内容，请修改</p>
      )}
    </div>
  );
}
