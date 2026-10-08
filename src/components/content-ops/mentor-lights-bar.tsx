/**
 * 全局导师进度彩灯条：一条 S0-S22 横向节点条，每个活跃 run 按 currentStepCode
 * 在对应节点上方放一个彩色圆点；下方图例「色点 = 导师英文名」，方便一眼看全导师进度。
 */
import type { RunListItem } from './types';

const TIMELINE: Array<{ code: string; short: string }> = [
  { code: 'S0', short: '建' },
  { code: 'S1', short: '材料' },
  { code: 'S2', short: '归档' },
  { code: 'S3', short: '门禁' },
  { code: 'S4', short: 'Claude' },
  { code: 'S5', short: '产物' },
  { code: 'S6', short: 'Codex' },
  { code: 'S7', short: '核验' },
  { code: 'S8', short: '阅览' },
  { code: 'S9', short: '批准' },
  { code: 'S10', short: '回复' },
  { code: 'S11', short: '吸收' },
  { code: 'S12', short: '二轮' },
  { code: 'S13', short: '二轮材' },
  { code: 'S14', short: '二Claude' },
  { code: 'S15', short: '二归档' },
  { code: 'S16', short: '二Codex' },
  { code: 'S17', short: '二核验' },
  { code: 'S18', short: '二阅览' },
  { code: 'S19', short: '二批准' },
  { code: 'S20', short: '二回复' },
  { code: 'S21', short: '集成' },
  { code: 'S22', short: '上线' },
];

// 稳定、可区分的色板（同一 mentorDir 永远同色）
const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
];

function colorOf(mentorDir: string): string {
  let h = 0;
  for (let i = 0; i < mentorDir.length; i++) h = (h * 31 + mentorDir.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** 稳定定色：同一 mentorDir 永远映射到同一色点 */
export function mentorColor(mentorDir: string): string {
  return colorOf(mentorDir);
}

export const MENTOR_TERMINAL = new Set(['completed', 'cancelled']);

const TERMINAL = new Set(['completed', 'cancelled']);

export function MentorLightsBar({ runs }: { runs: RunListItem[] }) {
  const active = runs.filter((r) => !TERMINAL.has(r.status));
  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        暂无活跃导师进程
      </div>
    );
  }

  // 按 currentStepCode 分组，方便在节点上方叠加圆点
  const byStep = new Map<string, RunListItem[]>();
  for (const r of active) {
    const key = r.currentStepCode ?? 'S0';
    const arr = byStep.get(key) ?? [];
    arr.push(r);
    byStep.set(key, arr);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="mb-2 text-xs font-semibold text-slate-600">导师进度彩灯（色点 = 当前步骤位置）</div>
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-end gap-0">
          {TIMELINE.map((node) => {
            const dots = byStep.get(node.code) ?? [];
            return (
              <div key={node.code} className="flex flex-1 flex-col items-center" style={{ minWidth: 44 }}>
                {/* 该节点上叠加的导师圆点 */}
                <div className="mb-1 flex flex-wrap justify-center gap-0.5" style={{ minHeight: 14 }}>
                  {dots.map((r) => (
                    <span
                      key={r.id}
                      title={`${r.mentorDir} · ${r.status}`}
                      className="inline-block rounded-full ring-1 ring-white"
                      style={{ width: 11, height: 11, backgroundColor: colorOf(r.mentorDir) }}
                    />
                  ))}
                </div>
                <div className="h-2 w-2 rounded-full bg-slate-300" />
                <div className="mt-1 text-[10px] text-slate-500">{node.short}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* 图例：色点 = 导师英文名 */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {active.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5 text-xs text-slate-700">
            <span
              className="inline-block rounded-full"
              style={{ width: 10, height: 10, backgroundColor: colorOf(r.mentorDir) }}
            />
            <span className="font-medium">{r.mentorDir}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{r.currentStepCode ?? 'S0'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
