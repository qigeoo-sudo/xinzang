'use client';

/**
 * 全局数据区间 context：admin-console 顶栏选择，所有后台视图共享。
 * demo 阶段视图内总量数据仍是固定快照；useAdminApi 会把 start/end 拼到请求 query，
 * 真实后端就绪后按区间返回数据即可，视图层无需再改。
 */
import { createContext, useContext } from 'react';

export interface DataRange { start: string; end: string }

export const DEFAULT_DATA_RANGE: DataRange = { start: '2026-07-09', end: '2026-10-01' };

export const DataRangeContext = createContext<DataRange>(DEFAULT_DATA_RANGE);

export function useDataRange(): DataRange {
  return useContext(DataRangeContext);
}

/** 区间天数（含首尾两天），start 为空时返回 null */
export function rangeDays(range: DataRange): number | null {
  if (!range.start) return null;
  return Math.max(1, Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1);
}
