/**
 * 导师访谈龙虾工作台 —— 状态机与步骤定义（纯数据/纯函数，无 Prisma 依赖）
 * 设计依据：docs/mentor-content-operations-v1.md §7-8
 *
 * 约定：
 * - Run 状态字符串与设计文档 §7.1 逐字一致，禁止在代码里另造状态名。
 * - 步骤 S0-S22 的操作者/责任方与 §8 表格逐字对应。
 * - P1 仅实现到 S7（P1_ACTIVE_CODES）；后续步骤只定义、不开放按钮。
 */

// ------------------------------------------------------------------
// Run 状态（§7.1）
// ------------------------------------------------------------------

export const RUN_STATE = {
  // 上游 NDA 段（planned，P5 前不启用）
  NDA_PENDING: 'nda_pending',
  NDA_BLOCKED: 'nda_blocked',
  GUIDE_SENT: 'guide_sent',
  ROUND1_OUTLINE_SENT: 'round1_outline_sent',

  // 当前主线段
  WAITING_RUNNER: 'waiting_runner',
  WAITING_ROUND1_SUBMISSION: 'waiting_round1_submission',
  ROUND1_MATERIAL_RECEIVED: 'round1_material_received',
  ROUND1_ARCHIVING: 'round1_archiving',
  ROUND1_ARCHIVED: 'round1_archived',
  VPN_CHECK_FAILED: 'vpn_check_failed',
  CLAUDE_MANUAL_STEP: 'claude_manual_step',
  CLAUDE_OUTPUT_ARCHIVED: 'claude_output_archived',
  CODEX_ROUND1_ASSEMBLY: 'codex_round1_assembly',
  ROUND1_DOCS_QC: 'round1_docs_qc',
  ROUND1_DOCS_QC_FAILED: 'round1_docs_qc_failed',
  AWAITING_SEND_APPROVAL_ROUND1_DOCS: 'awaiting_send_approval_round1_docs',
  ROUND1_DOCS_SENT: 'round1_docs_sent',
  WAITING_ROUND1_REVIEW_REPLY: 'waiting_round1_review_reply',
  ROUND1_REPLY_RECEIVED: 'round1_reply_received',
  CODEX_ROUND1_ABSORB: 'codex_round1_absorb',
  AWAITING_SEND_APPROVAL_ROUND2_OUTLINE: 'awaiting_send_approval_round2_outline',
  ROUND2_OUTLINE_SENT: 'round2_outline_sent',
  WAITING_ROUND2_SUBMISSION: 'waiting_round2_submission',
  ROUND2_MATERIAL_RECEIVED: 'round2_material_received',
  CODEX_ROUND2_UPDATE: 'codex_round2_update',
  ROUND2_DOCS_QC: 'round2_docs_qc',
  ROUND2_DOCS_QC_FAILED: 'round2_docs_qc_failed',
  AWAITING_SEND_APPROVAL_ROUND2_DOCS: 'awaiting_send_approval_round2_docs',
  ROUND2_DOCS_SENT: 'round2_docs_sent',
  WAITING_ROUND2_REVIEW_REPLY: 'waiting_round2_review_reply',
  ROUND2_REPLY_RECEIVED: 'round2_reply_received',
  CODEX_FINAL_ABSORB: 'codex_final_absorb',

  // 编入网站段（与 D:\database\AGENTS.md 第 22 节逐字一致）
  FINAL_HANDOFF_DISCOVERED: 'final_handoff_discovered',
  FINAL_HANDOFF_PREFLIGHT: 'final_handoff_preflight',
  FINAL_HANDOFF_BLOCKED: 'final_handoff_blocked',
  READY_FOR_INTEGRATION: 'ready_for_integration',
  AWAITING_STAGING_INTEGRATION_APPROVAL: 'awaiting_staging_integration_approval',
  RECONCILING_SNAPSHOTS: 'reconciling_snapshots',
  INTEGRATION_BACKUP_CREATED: 'integration_backup_created',
  INTEGRATING_APPLICATION: 'integrating_application',
  TESTING_STAGING: 'testing_staging',
  PUSHING_MAIN: 'pushing_main',
  DEPLOYING_STAGING: 'deploying_staging',
  AWAITING_STAGING_ACCEPTANCE: 'awaiting_staging_acceptance',
  PRODUCTION_APPROVAL_GRANTED: 'production_approval_granted',
  LOCKING_ACCEPTED_MAIN_SHA: 'locking_accepted_main_sha',
  PROMOTING_MAIN_TO_MASTER: 'promoting_main_to_master',
  DEPLOYING_PRODUCTION: 'deploying_production',
  VERIFYING_PRODUCTION: 'verifying_production',
  COMPLETED: 'completed',
  PRODUCTION_FAILED_ROLLED_BACK: 'production_failed_rolled_back',
} as const;

export type RunState = (typeof RUN_STATE)[keyof typeof RUN_STATE];

/** 干预态（§7.1 末），可叠加：存于 ContentOpsStep.status / Run 单独状态 */
export const INTERVENTION_STATE = {
  WAITING_HUMAN_INPUT: 'waiting_human_input',
  FAILED: 'failed',
  INTERRUPTED_RESUMABLE: 'interrupted_resumable',
  CANCELLED: 'cancelled',
} as const;

// ------------------------------------------------------------------
// 步骤状态
// ------------------------------------------------------------------

export const STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  WAITING_HUMAN: 'waiting_human',
  SKIPPED: 'skipped',
} as const;

export type StepStatus = (typeof STEP_STATUS)[keyof typeof STEP_STATUS];

// ------------------------------------------------------------------
// 责任方（§4 单写者规则）
// ------------------------------------------------------------------

export const ACTOR = {
  HUMAN: 'human',
  RUNNER: 'runner',
  CODEX: 'codex',
  CLAUDE: 'claude',
  TRAE: 'trae',
  CONTROL_PLANE: 'control_plane',
} as const;

export type Actor = (typeof ACTOR)[keyof typeof ACTOR];

// ------------------------------------------------------------------
// 步骤定义 S0-S22（§8 表格）
// ------------------------------------------------------------------

export interface StepDef {
  code: string;
  title: string;
  /** 实际操作者 */
  actor: Actor;
  /** 单写者 / 当前责任方 */
  owner: Actor;
  /** 步骤完成后 Run 进入的主线状态（最后一步除外） */
  nextRunState: RunState;
  /** 该步骤是否需要 VPN（Claude/Codex/GitHub 类） */
  needsVpn: boolean;
  /** 该步骤是否走飞书直连（提示关 VPN） */
  isFeishu: boolean;
  /** P1 是否实际开放（P1 试点验收边界：S0-S7） */
  p1Active: boolean;
}

export const STEP_DEFS: StepDef[] = [
  {
    code: 'S0', title: 'Run 建立：确认导师身份、飞书群与环境',
    actor: ACTOR.HUMAN, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.WAITING_ROUND1_SUBMISSION,
    needsVpn: false, isFeishu: false, p1Active: true,
  },
  {
    code: 'S1', title: '第一轮材料定位与下载（Runner 登记制）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_MATERIAL_RECEIVED,
    needsVpn: false, isFeishu: true, p1Active: true,
  },
  {
    code: 'S2', title: '归并、规范化命名与 D 盘归档（人工批准后执行）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_ARCHIVED,
    needsVpn: false, isFeishu: false, p1Active: true,
  },
  {
    code: 'S3', title: 'VPN / 连通性探测',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.CLAUDE_MANUAL_STEP,
    needsVpn: false, isFeishu: false, p1Active: true,
  },
  {
    code: 'S4', title: 'Claude 人工提交（导师风格摹写对话，Sonnet 5.5 中等）',
    actor: ACTOR.HUMAN, owner: ACTOR.HUMAN,
    nextRunState: RUN_STATE.CLAUDE_MANUAL_STEP,
    needsVpn: true, isFeishu: false, p1Active: true,
  },
  {
    code: 'S5', title: 'Claude 产物下载与 by sonnet 归档（R3 勾选门控）',
    actor: ACTOR.HUMAN, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.CLAUDE_OUTPUT_ARCHIVED,
    needsVpn: false, isFeishu: false, p1Active: true,
  },
  {
    code: 'S6', title: 'Codex 第一轮 Assembly（专属对话，固定触发语）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_ROUND1_ASSEMBLY,
    needsVpn: true, isFeishu: false, p1Active: true,
  },
  {
    code: 'S7', title: 'Assembly 完成核验（完成报告/00_START_HERE/验证结果）',
    actor: ACTOR.RUNNER, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.ROUND1_DOCS_QC,
    needsVpn: false, isFeishu: false, p1Active: true,
  },
  {
    code: 'S8', title: '第一轮阅览文件定位 + Ying 参考（v0.1）比对',
    actor: ACTOR.TRAE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.AWAITING_SEND_APPROVAL_ROUND1_DOCS,
    needsVpn: false, isFeishu: false, p1Active: false,
  },
  {
    code: 'S9', title: '人工批准 + 发送第一轮阅览文件（G1，固定文案）',
    actor: ACTOR.HUMAN, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_DOCS_SENT,
    needsVpn: false, isFeishu: true, p1Active: false,
  },
  {
    code: 'S10', title: '第一轮审核清单回复接收归档（_回复 命名）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_REPLY_RECEIVED,
    needsVpn: false, isFeishu: true, p1Active: false,
  },
  {
    code: 'S11', title: 'Codex 吸收第一轮回复（复用同一对话，固定触发语）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_ROUND1_ABSORB,
    needsVpn: true, isFeishu: false, p1Active: false,
  },
  {
    code: 'S12', title: '人工批准 + 发送第二轮官方大纲（G2，固定链接+文案）',
    actor: ACTOR.HUMAN, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND2_OUTLINE_SENT,
    needsVpn: false, isFeishu: true, p1Active: false,
  },
  {
    code: 'S13', title: '第二轮材料识别与归档（歧义必须人工确认）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND2_MATERIAL_RECEIVED,
    needsVpn: false, isFeishu: true, p1Active: false,
  },
  {
    code: 'S14', title: 'Codex 第二轮候选更新（固定触发语）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_ROUND2_UPDATE,
    needsVpn: true, isFeishu: false, p1Active: false,
  },
  {
    code: 'S15', title: '第二轮审核清单比对（v0.3）+ G3 批准 + 发送',
    actor: ACTOR.TRAE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.ROUND2_DOCS_SENT,
    needsVpn: false, isFeishu: true, p1Active: false,
  },
  {
    code: 'S16', title: '第二轮回复接收归档 + Codex 最终吸收',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_FINAL_ABSORB,
    needsVpn: true, isFeishu: true, p1Active: false,
  },
  {
    code: 'S17', title: 'Final Handoff 发现（最新有效不可变包）',
    actor: ACTOR.CONTROL_PLANE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.FINAL_HANDOFF_PREFLIGHT,
    needsVpn: false, isFeishu: false, p1Active: false,
  },
  {
    code: 'S18', title: 'Final Handoff 完整预检（AGENTS 第 16 节逐项）',
    actor: ACTOR.CONTROL_PLANE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.READY_FOR_INTEGRATION,
    needsVpn: false, isFeishu: false, p1Active: false,
  },
  {
    code: 'S19', title: 'pending 归零处置（Codex 逐张，Trae 无升级权）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL,
    needsVpn: false, isFeishu: false, p1Active: false,
  },
  {
    code: 'S20', title: '第一次人工确认：确认交给Trae集成至main和测试端（G4）',
    actor: ACTOR.HUMAN, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.INTEGRATING_APPLICATION,
    needsVpn: false, isFeishu: false, p1Active: false,
  },
  {
    code: 'S21', title: 'Trae 集成：对账→备份→集成→八类测试→推main→部署测试端',
    actor: ACTOR.TRAE, owner: ACTOR.TRAE,
    nextRunState: RUN_STATE.AWAITING_STAGING_ACCEPTANCE,
    needsVpn: true, isFeishu: false, p1Active: false,
  },
  {
    code: 'S22', title: '测试端验收 + 验收通过并发布生产（main → master → aihr.top）（G5）',
    actor: ACTOR.HUMAN, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.COMPLETED,
    needsVpn: true, isFeishu: false, p1Active: false,
  },
];

export const P1_ACTIVE_CODES = STEP_DEFS.filter((s) => s.p1Active).map((s) => s.code);

const STEP_BY_CODE = new Map(STEP_DEFS.map((s) => [s.code, s]));

export function getStepDef(code: string): StepDef {
  const def = STEP_BY_CODE.get(code);
  if (!def) throw new Error(`未知步骤码: ${code}`);
  return def;
}

export function nextStepCode(code: string): string | null {
  const idx = STEP_DEFS.findIndex((s) => s.code === code);
  if (idx < 0 || idx >= STEP_DEFS.length - 1) return null;
  return STEP_DEFS[idx + 1].code;
}

// ------------------------------------------------------------------
// 导师目录归一化键（不区分大小写、压缩空格，§11.2 / §8 S0）
// aaaa bbb 为忽略目录；z-others 与 D:\database\xinzang 只读
// ------------------------------------------------------------------

const IGNORED_DIRS = new Set(['aaaa bbb']);
const READONLY_DIRS = new Set(['z-others', 'xinzang']);

export function normalizeMentorDirKey(dir: string): string {
  return dir.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function mentorDirStatus(dir: string): 'ok' | 'ignored' | 'readonly' {
  const key = normalizeMentorDirKey(dir);
  if (IGNORED_DIRS.has(key)) return 'ignored';
  if (READONLY_DIRS.has(key)) return 'readonly';
  return 'ok';
}

// ------------------------------------------------------------------
// 状态迁移（§7.2：迁移必须携带证据/时间/责任方/前一状态；此处只校验合法性）
// 主线近似线性，允许：前进、进入失败/人工干预态、从干预态恢复
// ------------------------------------------------------------------

const MAINLINE_ORDER: RunState[] = [
  RUN_STATE.WAITING_RUNNER,
  RUN_STATE.WAITING_ROUND1_SUBMISSION,
  RUN_STATE.ROUND1_MATERIAL_RECEIVED,
  RUN_STATE.ROUND1_ARCHIVING,
  RUN_STATE.ROUND1_ARCHIVED,
  RUN_STATE.CLAUDE_MANUAL_STEP,
  RUN_STATE.CLAUDE_OUTPUT_ARCHIVED,
  RUN_STATE.CODEX_ROUND1_ASSEMBLY,
  RUN_STATE.ROUND1_DOCS_QC,
  RUN_STATE.AWAITING_SEND_APPROVAL_ROUND1_DOCS,
  RUN_STATE.ROUND1_DOCS_SENT,
  RUN_STATE.WAITING_ROUND1_REVIEW_REPLY,
  RUN_STATE.ROUND1_REPLY_RECEIVED,
  RUN_STATE.CODEX_ROUND1_ABSORB,
  RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_OUTLINE,
  RUN_STATE.ROUND2_OUTLINE_SENT,
  RUN_STATE.WAITING_ROUND2_SUBMISSION,
  RUN_STATE.ROUND2_MATERIAL_RECEIVED,
  RUN_STATE.CODEX_ROUND2_UPDATE,
  RUN_STATE.ROUND2_DOCS_QC,
  RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_DOCS,
  RUN_STATE.ROUND2_DOCS_SENT,
  RUN_STATE.WAITING_ROUND2_REVIEW_REPLY,
  RUN_STATE.ROUND2_REPLY_RECEIVED,
  RUN_STATE.CODEX_FINAL_ABSORB,
  RUN_STATE.FINAL_HANDOFF_DISCOVERED,
  RUN_STATE.FINAL_HANDOFF_PREFLIGHT,
  RUN_STATE.READY_FOR_INTEGRATION,
  RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL,
  RUN_STATE.RECONCILING_SNAPSHOTS,
  RUN_STATE.INTEGRATION_BACKUP_CREATED,
  RUN_STATE.INTEGRATING_APPLICATION,
  RUN_STATE.TESTING_STAGING,
  RUN_STATE.PUSHING_MAIN,
  RUN_STATE.DEPLOYING_STAGING,
  RUN_STATE.AWAITING_STAGING_ACCEPTANCE,
  RUN_STATE.PRODUCTION_APPROVAL_GRANTED,
  RUN_STATE.LOCKING_ACCEPTED_MAIN_SHA,
  RUN_STATE.PROMOTING_MAIN_TO_MASTER,
  RUN_STATE.DEPLOYING_PRODUCTION,
  RUN_STATE.VERIFYING_PRODUCTION,
  RUN_STATE.COMPLETED,
];

/** 允许回退（重做/修订）的分支目标 */
const ALLOWED_ROLLBACK: Record<string, RunState[]> = {
  [RUN_STATE.ROUND1_DOCS_QC_FAILED]: [RUN_STATE.CODEX_ROUND1_ASSEMBLY],
  [RUN_STATE.ROUND2_DOCS_QC_FAILED]: [RUN_STATE.CODEX_ROUND2_UPDATE],
  [RUN_STATE.FINAL_HANDOFF_BLOCKED]: [RUN_STATE.FINAL_HANDOFF_PREFLIGHT, RUN_STATE.CODEX_FINAL_ABSORB],
  [RUN_STATE.PRODUCTION_FAILED_ROLLED_BACK]: [RUN_STATE.AWAITING_STAGING_ACCEPTANCE],
};

const INTERVENTION_RUN_STATES = new Set<string>([
  INTERVENTION_STATE.WAITING_HUMAN_INPUT,
  INTERVENTION_STATE.FAILED,
  INTERVENTION_STATE.INTERRUPTED_RESUMABLE,
  INTERVENTION_STATE.CANCELLED,
  RUN_STATE.VPN_CHECK_FAILED,
  RUN_STATE.ROUND1_DOCS_QC_FAILED,
  RUN_STATE.ROUND2_DOCS_QC_FAILED,
  RUN_STATE.FINAL_HANDOFF_BLOCKED,
  RUN_STATE.PRODUCTION_FAILED_ROLLED_BACK,
]);

export function canTransition(from: string, to: string): boolean {
  if (from === to) return false;
  if (to === INTERVENTION_STATE.CANCELLED) return from !== RUN_STATE.COMPLETED;
  // 任意非终态可进入干预/失败态
  if (INTERVENTION_RUN_STATES.has(to) && to !== RUN_STATE.COMPLETED) return true;
  // 从干预态恢复：目标必须是主线状态（具体恢复点由调用方凭证据决定）
  if (INTERVENTION_RUN_STATES.has(from)) return MAINLINE_ORDER.includes(to as RunState);
  // waiting_runner 只被 Runner 心跳解除
  if (from === RUN_STATE.WAITING_RUNNER) {
    return to === RUN_STATE.WAITING_ROUND1_SUBMISSION || INTERVENTION_RUN_STATES.has(to);
  }
  const fi = MAINLINE_ORDER.indexOf(from as RunState);
  const ti = MAINLINE_ORDER.indexOf(to as RunState);
  if (fi === -1 || ti === -1) return false;
  if (ti >= fi) return true; // 允许同级/前进（中间瞬时态由调用方按步骤收敛）
  // 向后只允许显式回退分支
  return (ALLOWED_ROLLBACK[from] ?? []).includes(to as RunState);
}
