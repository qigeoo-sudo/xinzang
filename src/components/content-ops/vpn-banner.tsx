'use client';

/**
 * 全局 VPN 提示条（§6.0）：内容跟随「下一步要做什么」，由详情接口的 vpn.hint 驱动；
 * 总览页在没有具体步骤时传入仅含 level/endpoints 的 hint。红/黄/灰有交互，绿收成一行。
 */
import { useState } from 'react';
import type { VpnHint } from './types';

const LEVEL_STYLE: Record<VpnHint['level'], { bar: string; dot: string }> = {
  red: { bar: 'border-red-200 bg-red-50 text-red-800', dot: 'bg-red-500' },
  green: { bar: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  amber: { bar: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  gray: { bar: 'border-stone-200 bg-stone-100 text-stone-600', dot: 'bg-stone-400' },
};

export function VpnBanner({
  hint,
  onReprobe,
  runnerGuide,
}: {
  hint: VpnHint;
  onReprobe?: () => void;
  runnerGuide?: string;
}) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLE[hint.level];
  const chips = hint.endpoints.map((e) => (
    <span
      key={e.key}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        e.reachable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
      title={e.required ? '下一步需要' : '参照点'}
    >
      {e.label}
      {e.reachable ? '●' : '○'}
    </span>
  ));

  return (
    <div className={`rounded-xl border px-4 py-2.5 text-sm ${style.bar}`} data-vpn-level={hint.level}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
        <span className="font-medium">{hint.title}</span>
        {hint.level === 'red' && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs underline underline-offset-2"
          >
            {open ? '收起端点明细' : '展开端点明细'}
          </button>
        )}
        {(hint.level === 'red' || hint.level === 'gray') && onReprobe && (
          <button
            type="button"
            onClick={onReprobe}
            className="rounded-md border border-current/30 px-2 py-0.5 text-xs"
          >
            重新探测
          </button>
        )}
        {hint.level === 'gray' && runnerGuide && (
          <span className="text-xs">{runnerGuide}</span>
        )}
      </div>
      {hint.level === 'red' && open && (
        <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>
      )}
      {hint.level === 'green' && hint.endpoints.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 opacity-70">{chips}</div>
      )}
    </div>
  );
}
