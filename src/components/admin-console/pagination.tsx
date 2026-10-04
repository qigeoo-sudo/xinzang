'use client';

/** 后台通用分页器：每页 20/50/100 条 + 总数 + 上一页/页码/下一页（与用户明细页同款青蓝样式） */
interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** 总数计量单位：位/个…（「每页」后固定用「条」） */
  totalUnit?: string;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  /** 总数前的引导文案，默认「共」；可传「样本」等 */
  totalPrefix?: string;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalUnit = '条',
  onPageChange,
  onPageSizeChange,
  totalPrefix = '共',
  className = '',
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pageCount);
  return (
    <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-xs text-stone-500 ${className}`}>
      <div className="flex items-center gap-1">
        <span>每页</span>
        {[20, 50, 100].map((n) => (
          <button
            key={n}
            onClick={() => onPageSizeChange(n)}
            className={`min-w-[2rem] rounded-md px-2 py-1 transition-colors ${
              pageSize === n ? 'bg-[#0e7490] font-medium text-white' : 'border border-stone-200 bg-white text-stone-600 hover:border-cyan-300'
            }`}
          >
            {n}
          </button>
        ))}
        <span>条 · {totalPrefix} {total.toLocaleString()} {totalUnit}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, cur - 1))}
          disabled={cur <= 1}
          className="rounded-md border border-stone-200 bg-white px-2.5 py-1 transition-colors hover:border-cyan-300 disabled:opacity-40"
        >
          上一页
        </button>
        <span className="tabular-nums">第 {cur} / {pageCount} 页</span>
        <button
          onClick={() => onPageChange(Math.min(pageCount, cur + 1))}
          disabled={cur >= pageCount}
          className="rounded-md border border-stone-200 bg-white px-2.5 py-1 transition-colors hover:border-cyan-300 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

/** 分页计算工具：切片当前页数据，页码越界自动钳制 */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(Math.max(1, page), pageCount);
  return { paged: rows.slice((cur - 1) * pageSize, cur * pageSize), pageCur: cur, pageCount };
}
