/**
 * S11 Codex 吸收版本包识别（纯函数）。
 *
 * 判据（2026-10-08 用户定，M5 Runner 自动投递沿用同一口径）：
 * 1. S7 已核验包（第一轮访谈大纲回复后的 Assembly）标灰可见，正常不会是本轮产物；
 * 2. 包内 00_START_HERE.md 的 mtime 必须晚于 S11「登记已提交」时刻——
 *    Codex 在该时刻之后才开始吸收，更早的包不可能是本轮产物；
 * 3. 满足前两条的候选中取 mtime 最新者自动预选（recommended）；
 * 4. 没有合规新包时 ready=false（Codex 可能尚未完成），调用方提示等待、不得冒认旧包；
 * 5. 规范允许 Codex「创建或更新」版本包：若其就地更新 S7 旧包（mtime 晚于提交时刻），
 *    标 isPreviousRound=true 但不预选，交人工核对后可手动选择（面板不禁选）。
 */

export interface AbsorbPackageMeta {
  name: string;
  /** 00_START_HERE.md 的 mtime（ISO） */
  mtime: string | null;
  size?: number;
}

export interface AbsorbPackageView extends AbsorbPackageMeta {
  /** S7 已核验的上一轮版本包 */
  isPreviousRound: boolean;
  /** mtime 晚于 S11 提交时刻 */
  afterSubmit: boolean;
  /** 自动预选：本轮新包中 mtime 最新者 */
  recommended: boolean;
}

export interface AbsorbPickInput {
  packages: AbsorbPackageMeta[];
  /** S7 evidence.chosenPackage（上一轮已核验包名，可为空兼容旧 Run） */
  previousPackage?: string | null;
  /** S11 codexSubmit.at（ISO，通知 Codex 开始吸收的时刻） */
  submittedAt: string;
}

export function pickAbsorbPackages(input: AbsorbPickInput): {
  packages: AbsorbPackageView[];
  /** 是否存在本轮合规新包 */
  ready: boolean;
  recommended: string | null;
} {
  const submittedMs = Date.parse(input.submittedAt);
  const valid = input.packages
    .filter((p) => p.name && p.mtime && Number.isFinite(Date.parse(p.mtime)))
    .map((p) => {
      const mtimeMs = Date.parse(p.mtime as string);
      const isPreviousRound = Boolean(input.previousPackage) && p.name === input.previousPackage;
      const afterSubmit = mtimeMs > submittedMs;
      return { ...p, isPreviousRound, afterSubmit, recommended: false };
    });
  // 约定（用户定）：包带合法时间戳时只出 mtime 最新的一份，不再罗列全部版本包；
  // 最新者恰为上一轮旧包时就地更新场景标 isPreviousRound，交人工核对（ready=false 但可选）。
  if (valid.length === 0) return { packages: [], ready: false, recommended: null };
  const latest = [...valid].sort((a, b) => Date.parse(b.mtime as string) - Date.parse(a.mtime as string))[0];
  const isFresh = latest.afterSubmit && !latest.isPreviousRound;
  if (isFresh) latest.recommended = true;
  return { packages: [latest], ready: isFresh, recommended: isFresh ? latest.name : null };
}
