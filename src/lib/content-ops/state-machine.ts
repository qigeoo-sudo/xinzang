/**
 * 导师访谈龙虾工作台 —— 状态机与步骤定义（纯数据/纯函数，无 Prisma 依赖）
 * 设计依据：docs/mentor-content-operations-v1.md §7-8
 *
 * 约定：
 * - Run 状态字符串与设计文档 §7.1 逐字一致，禁止在代码里另造状态名。
 * - 步骤 S0-S22 的操作者/责任方与 §8 表格逐字对应。
 * - 已开放步骤（active）：P1=S0-S7；P2a=S8-S9；P2b=S10-S11。后续步骤只定义、不开放按钮。
 * - P2 依据：docs/mentor-content-operations-v1.md §543（P2 验收=验证报告+真实导师 S1/S9/S12 全链路）。
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
  /** 是否已开放（试点推进逐步激活：P1=S0-S7，P2a=S8-S9） */
  active: boolean;
}

export const STEP_DEFS: StepDef[] = [
  {
    code: 'S0', title: 'Run 建立：确认导师身份、飞书群与环境',
    actor: ACTOR.HUMAN, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.WAITING_ROUND1_SUBMISSION,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S1', title: '第一轮材料定位与下载（Runner 登记制）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_MATERIAL_RECEIVED,
    needsVpn: false, isFeishu: true, active: true,
  },
  {
    code: 'S2', title: '归并、规范化命名与 D 盘归档（人工批准后执行）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_ARCHIVED,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S3', title: 'VPN / 连通性探测',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.CLAUDE_MANUAL_STEP,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S4', title: 'Claude 人工提交（导师风格摹写对话，Sonnet 5.5 中等）',
    actor: ACTOR.HUMAN, owner: ACTOR.HUMAN,
    nextRunState: RUN_STATE.CLAUDE_MANUAL_STEP,
    needsVpn: true, isFeishu: false, active: true,
  },
  {
    code: 'S5', title: 'Claude 产物下载与 by sonnet 归档（R3 勾选门控）',
    actor: ACTOR.HUMAN, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.CLAUDE_OUTPUT_ARCHIVED,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S6', title: 'Codex 第一轮 Assembly（专属对话，固定触发语）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_ROUND1_ASSEMBLY,
    needsVpn: true, isFeishu: false, active: true,
  },
  {
    code: 'S7', title: 'Assembly 完成核验（完成报告/00_START_HERE/验证结果）',
    actor: ACTOR.RUNNER, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.ROUND1_DOCS_QC,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S8', title: '第一轮阅览文件定位 + Ying 参考（v0.1）比对',
    actor: ACTOR.TRAE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.AWAITING_SEND_APPROVAL_ROUND1_DOCS,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S9', title: '人工批准 + 发送第一轮阅览文件（G1，固定文案）',
    actor: ACTOR.HUMAN, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_DOCS_SENT,
    needsVpn: false, isFeishu: true, active: true,
  },
  {
    code: 'S10', title: '第一轮审核清单回复接收归档（_回复 命名）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND1_REPLY_RECEIVED,
    needsVpn: false, isFeishu: true, active: true,
  },
  {
    code: 'S11', title: 'Codex 吸收第一轮回复（复用同一对话，固定触发语）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_ROUND1_ABSORB,
    needsVpn: true, isFeishu: false, active: true,
  },
  {
    code: 'S12', title: '人工批准 + 发送第二轮官方大纲（G2，固定链接+文案）',
    actor: ACTOR.HUMAN, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND2_OUTLINE_SENT,
    needsVpn: false, isFeishu: true, active: true,
  },
  {
    code: 'S13', title: '第二轮材料识别与归档（歧义必须人工确认）',
    actor: ACTOR.RUNNER, owner: ACTOR.RUNNER,
    nextRunState: RUN_STATE.ROUND2_MATERIAL_RECEIVED,
    needsVpn: false, isFeishu: true, active: true,
  },
  {
    code: 'S14', title: 'Codex 第二轮候选更新（固定触发语）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_ROUND2_UPDATE,
    needsVpn: true, isFeishu: false, active: true,
  },
  {
    code: 'S15', title: '第二轮审核清单比对（v0.3）+ G3 批准 + 发送',
    actor: ACTOR.TRAE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.ROUND2_DOCS_SENT,
    needsVpn: false, isFeishu: true, active: true,
  },
  {
    code: 'S16', title: '第二轮回复接收归档 + Codex 最终吸收',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.CODEX_FINAL_ABSORB,
    needsVpn: true, isFeishu: true, active: true,
  },
  {
    code: 'S17', title: 'Final Handoff 发现（最新有效不可变包）',
    actor: ACTOR.CONTROL_PLANE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.FINAL_HANDOFF_PREFLIGHT,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S18', title: 'Final Handoff 完整预检（AGENTS 第 16 节逐项）',
    actor: ACTOR.CONTROL_PLANE, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.READY_FOR_INTEGRATION,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S19', title: 'pending 归零处置（Codex 逐张，Trae 无升级权）',
    actor: ACTOR.CODEX, owner: ACTOR.CODEX,
    nextRunState: RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S20', title: '第一次人工确认：确认交给Trae集成至main和测试端（G4）',
    actor: ACTOR.HUMAN, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.INTEGRATING_APPLICATION,
    needsVpn: false, isFeishu: false, active: true,
  },
  {
    code: 'S21', title: 'Trae 集成：对账→备份→集成→八类测试→推main→部署测试端',
    actor: ACTOR.TRAE, owner: ACTOR.TRAE,
    nextRunState: RUN_STATE.AWAITING_STAGING_ACCEPTANCE,
    needsVpn: true, isFeishu: false, active: true,
  },
  {
    code: 'S22', title: '测试端验收 + 验收通过并发布生产（main → master → aihr.top）（G5）',
    actor: ACTOR.HUMAN, owner: ACTOR.CONTROL_PLANE,
    nextRunState: RUN_STATE.COMPLETED,
    needsVpn: true, isFeishu: false, active: true,
  },
];

export const ACTIVE_CODES = STEP_DEFS.filter((s) => s.active).map((s) => s.code);

// ------------------------------------------------------------------
// S9 G1 固定文案（D:\database\AGENTS.md 第 9 节逐字固定，禁止改写）
// ------------------------------------------------------------------

export const G1_ROUND1_DOCS_TEXT =
  '@导师，这里有两份文件，其中语言人格风格分析文件是供浏览用，不需要回复，而第一轮审核清单文件，需要阅读并回复，感谢。';

/**
 * G2 第二轮访谈大纲（AGENTS §11）：必须发送共享官方大纲，禁止另写导师专用版。
 * 一条文本消息：固定文案 + 官方链接（飞书自动识别为云文档卡片）。
 */
export const G2_OUTLINE_TEXT = '@导师，你好，这是第二轮访谈大纲，请查收，谢谢。';
export const G2_OUTLINE_LINK = 'https://rcnjoh3ukdwe.feishu.cn/docx/YAj1dG4jeoOy3FxELepczukdnIh';
export const G2_OUTLINE_MESSAGE = `${G2_OUTLINE_TEXT}\n${G2_OUTLINE_LINK}`;

/** G3 第二轮审核清单（AGENTS §13.4）：文件之后发送的固定文案 */
export const G3_ROUND2_DOCS_TEXT = '@导师，这是第二轮审核清单文件，需要阅读并回复，感谢。';

/**
 * G3 文案正文（去掉 "@导师" 前缀后的部分）。
 * 发送结构为 post 富文本：[{at: 导师 open_id}, {text: G3_ROUND2_DOCS_BODY}]。
 * 导师真实 open_id 由 Runner 在群成员中按排除法定位（除导师外只有 陈初效/陆秉文/机器人）。
 */
export const G3_ROUND2_DOCS_BODY = '，这是第二轮审核清单文件，需要阅读并回复，感谢。';

/**
 * G4 第一次集成确认（AGENTS §18）：按钮文案 + 影响范围声明。
 * 只授权应用集成、推 main、部署/更新测试端；不授权 master 与生产。
 * evidenceChecks 四项：预检全过 / pending 全归零 / Final Handoff 版本与全量哈希已记录 / 已读不触碰 master+生产声明。
 */
export const G4_INTEGRATION_APPROVAL_BUTTON = '确认交给Trae集成至main和测试端';
export const G4_INTEGRATION_APPROVAL_SCOPE = '本按钮只授权应用集成、推送 main、部署/更新测试端；不授权推送 master 或部署生产。';

/**
 * G5 第二次生产发布确认（AGENTS §18）：按钮文案 + 影响范围声明。
 * 授权锁定 main SHA、推送 main→master、部署生产 ECS、验证 aihr.top。
 * evidenceChecks 四项：测试端验收通过 / 已读生产发布影响 / main SHA 已锁定 / 已读回滚预案。
 */
export const G5_PRODUCTION_APPROVAL_BUTTON = '测试端验收通过并发布生产';
export const G5_PRODUCTION_APPROVAL_SCOPE = '本按钮授权锁定当前 main SHA、推送 main→master、部署生产 ECS（aihr.top）并执行线上验证；完成后 Run 结束。';

/** S21 六段集成阶段标签（与 RUN_STATE 链一致，供面板只读展示） */
export const S21_PHASES = [
  { code: 'reconcile', label: '对账（Final Handoff vs 仓库哈希基线）', runState: RUN_STATE.RECONCILING_SNAPSHOTS },
  { code: 'backup', label: '备份（带时间戳目录 + before hash）', runState: RUN_STATE.INTEGRATION_BACKUP_CREATED },
  { code: 'integrate', label: '集成（复制包内容到 current/）', runState: RUN_STATE.INTEGRATING_APPLICATION },
  { code: 'test', label: '八类测试（AGENTS §16.5 回归）', runState: RUN_STATE.TESTING_STAGING },
  { code: 'push_main', label: '推 main（git commit + push origin main）', runState: RUN_STATE.PUSHING_MAIN },
  { code: 'deploy_staging', label: '部署测试端（CloudBase 自动部署）', runState: RUN_STATE.DEPLOYING_STAGING },
] as const;

/** S22 生产发布阶段标签（G5 之后的自动段） */
export const S22_PHASES = [
  { code: 'lock_sha', label: '锁定 main SHA', runState: RUN_STATE.LOCKING_ACCEPTED_MAIN_SHA },
  { code: 'promote', label: 'main→master（git push origin main:master）', runState: RUN_STATE.PROMOTING_MAIN_TO_MASTER },
  { code: 'deploy_prod', label: '部署生产 ECS', runState: RUN_STATE.DEPLOYING_PRODUCTION },
  { code: 'verify', label: '验证生产 aihr.top', runState: RUN_STATE.VERIFYING_PRODUCTION },
] as const;

/** S19 pending 归零 Codex 触发语（AGENTS §17，逐张处置；Trae 无升级权） */
export const PENDING_DISPOSITION_TRIGGER =
  '该导师的 Final Handoff 预检发现 pending 知识卡，请依据导师审核回复和现行治理规则逐张处置：转 external_approved+generalized/exact、转 internal_approved+none、从最终候选快照排除并记录，或保持 pending 阻塞。';

/** S14 Codex 触发语（AGENTS §12.4，逐字固定；旧句语义未确认前不得代发） */
export const ROUND2_UPDATE_TRIGGER =
  '该导师的第二轮访谈音频和文字稿已经到达，请查阅并按照现行规范更新其prompt和知识卡，生成第二轮候选包及第二轮审核材料。';

/** S16 Codex 最终吸收触发语（AGENTS §14.4，逐字固定） */
export const ROUND2_ABSORB_TRIGGER = '该导师的第二轮访谈审核清单回复已经到达，请查阅并更新其prompt和知识卡。';

/** S8 四维比对项（§8：与 ying-v0.1 同类参考比结构/职责/密度/可读性） */
export const ROUND1_QC_ITEMS = [
  { key: 'structure', label: '结构', desc: '章节组织与使用说明结构与同类参考一致' },
  { key: 'duty', label: '职责', desc: '导师需做什么/不需做什么表述清晰无歧义' },
  { key: 'density', label: '密度', desc: '信息密度与同类参考相当（不臃肿不缺项）' },
  { key: 'readability', label: '可读性', desc: '导师本人能独立读懂并知道如何回复' },
] as const;

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
