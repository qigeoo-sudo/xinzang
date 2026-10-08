/**
 * 工作台业务引擎（服务端权威）：Run 生命周期、Runner 心跳/指令、S0-S7 推进。
 * 设计依据：docs/mentor-content-operations-v1.md §7-8、§11、§14。
 *
 * 铁律：
 * - 每次状态迁移经 canTransition 校验，并落 AgentEvent（不覆盖历史）
 * - Runner 上报一律视为候选：哈希通过才登记，导师目录规则在本引擎重算
 * - 失败不静默：step failed 时 run 进入 failed 干预态，页面给人工入口
 * - Trae 不代做 Claude/Codex 内容：本引擎没有任何"生成内容"的函数
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import {
  ACTOR,
  ACTIVE_CODES,
  G1_ROUND1_DOCS_TEXT,
  G2_OUTLINE_LINK,
  G2_OUTLINE_MESSAGE,
  G3_ROUND2_DOCS_BODY,
  G4_INTEGRATION_APPROVAL_BUTTON,
  G5_PRODUCTION_APPROVAL_BUTTON,
  PENDING_DISPOSITION_TRIGGER,
  ROUND2_ABSORB_TRIGGER,
  ROUND2_UPDATE_TRIGGER,
  RUN_STATE,
  STEP_DEFS,
  STEP_STATUS,
  canTransition,
  getStepDef,
  mentorDirStatus,
  normalizeMentorDirKey,
  nextStepCode,
} from './state-machine';
import {
  PREFLIGHT_ITEMS,
  runAllChecks,
  type CheckResult,
  type HandoffPackageMeta,
  type KnowledgeCardSpec,
  type PreflightInput,
} from './preflight-checks';
import { mentors } from '../mentors';
import { evaluateVpnHint, type VpnSnapshot } from './vpn-policy';
import { allDocsPass, scoreViewDoc, type DocCompareResult } from './ai-compare';
import {
  buildReplyFileName,
  filterReplyCandidates,
  type ReplyCandidate,
  type ReplyMessageMeta,
  type ReplyRound,
} from './reply';
import { pickAbsorbPackages, type AbsorbPackageMeta } from './absorb';
import {
  groupRound2Materials,
  round2DestDir,
  type MaterialFile,
} from './round2-material';

export class EngineError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const COMMAND = {
  HASH_FILES: 'hash_files',
  SCAN_WORK_PACKAGES: 'scan_work_packages',
  LIST_MENTOR_FILES: 'list_mentor_files',
  LIST_WORK_FILES: 'list_work_files',
  PREPARE_CLAUDE_OUTPUTS: 'prepare_claude_outputs',
  CODEX_PROBE: 'codex_probe',
  LOCATE_VIEW_DOCS: 'locate_view_docs',
  LOCATE_ROUND2_DOCS: 'locate_round2_docs',
  READ_VIEW_DOCS: 'read_view_docs',
  FEISHU_SEND_MESSAGE: 'feishu_send_message',
  FEISHU_LIST_MESSAGES: 'feishu_list_messages',
  FEISHU_DOWNLOAD_RESOURCE: 'feishu_download_resource',
  FEISHU_CHAT_INFO: 'feishu_chat_info',
  // P4a：S17-S20 Final Handoff 预检段
  SCAN_FINAL_HANDOFF: 'scan_final_handoff',
  PREFLIGHT_CHECKS: 'preflight_checks',
  RESOLVE_PENDING_CARD: 'resolve_pending_card',
  // P4b：S21 集成六段 + S22 生产发布四段
  GIT_FETCH_STATUS: 'git_fetch_status',
  GIT_BACKUP_CREATE: 'git_backup_create',
  GIT_INTEGRATE_HANDOFF: 'git_integrate_handoff',
  RUN_REGRESSION_TESTS: 'run_regression_tests',
  GIT_PUSH_MAIN: 'git_push_main',
  DEPLOY_STAGING: 'deploy_staging',
  // S21 activate_pilot 段：pilot 导师上线（复制 prompt 资产 + 远程灌卡到测试库）
  ACTIVATE_MENTOR_STAGING: 'activate_mentor_staging',
  GIT_PROMOTE_MAIN_TO_MASTER: 'git_promote_main_to_master',
  DEPLOY_PRODUCTION: 'deploy_production',
} as const;

const RUNNER_ONLINE_MS = 90_000;
const ACTIVE_RUN_EXCLUDE = [RUN_STATE.COMPLETED, 'cancelled' as string];

// ------------------------------------------------------------------
// 小工具
// ------------------------------------------------------------------

function sha256Text(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function newRunnerToken(): string {
  return randomBytes(32).toString('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

async function audit(
  actorId: string,
  action: string,
  targetId: string | null,
  metadata: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: { actorId, action, targetId, metadata: JSON.stringify(metadata) },
  });
}

async function appendEvent(
  data: { runId?: string | null; runnerId?: string | null; agent: string; type: string; payload: unknown },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;
  await db.contentOpsAgentEvent.create({
    data: {
      runId: data.runId ?? null,
      runnerId: data.runnerId ?? null,
      agent: data.agent,
      type: data.type,
      payload: JSON.stringify(data.payload),
    },
  });
}

async function transitionRun(
  tx: Prisma.TransactionClient,
  run: { id: string; status: string },
  to: string,
  reason: string,
) {
  if (!canTransition(run.status, to)) {
    throw new EngineError(409, `非法状态迁移：${run.status} → ${to}（${reason}）`);
  }
  await tx.contentOpsRun.update({
    where: { id: run.id },
    data: {
      status: to,
      finishedAt: ACTIVE_RUN_EXCLUDE.includes(to) ? new Date() : null,
    },
  });
  await appendEvent(
    { runId: run.id, agent: 'control_plane', type: 'status', payload: { from: run.status, to, reason } },
    tx,
  );
}

function triggerFor(mentorDir: string): string {
  const titled = mentorDir
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return `构建${titled}导师分身。`;
}

// ------------------------------------------------------------------
// Runner 注册 / 认证
// ------------------------------------------------------------------

export async function registerRunner(input: {
  registrationToken: string;
  machineKey: string;
  name: string;
  version: string;
}) {
  const expected = process.env.CONTENT_OPS_RUNNER_REGISTRATION_TOKEN;
  if (!expected) {
    throw new EngineError(503, '控制平面未配置 CONTENT_OPS_RUNNER_REGISTRATION_TOKEN');
  }
  if (
    input.registrationToken.length !== expected.length ||
    !timingSafeEqual(Buffer.from(input.registrationToken), Buffer.from(expected))
  ) {
    throw new EngineError(401, '注册令牌无效');
  }
  const exists = await prisma.contentOpsRunner.findUnique({ where: { machineKey: input.machineKey } });
  if (exists) {
    throw new EngineError(409, '该机器已注册（machineKey 冲突），如需重置请联系管理员');
  }
  const token = newRunnerToken();
  const runner = await prisma.contentOpsRunner.create({
    data: {
      machineKey: input.machineKey,
      tokenHash: sha256Text(token),
      name: input.name.slice(0, 100),
      version: input.version.slice(0, 40),
      status: 'offline',
    },
  });
  await appendEvent({
    runnerId: runner.id,
    agent: 'runner',
    type: 'note',
    payload: { registered: true, name: runner.name, version: runner.version },
  });
  return { runnerId: runner.id, runnerToken: token };
}

export async function authenticateRunnerToken(runnerId: string, token: string) {
  const runner = await prisma.contentOpsRunner.findUnique({ where: { id: runnerId } });
  if (!runner || !safeEqualHex(sha256Text(token), runner.tokenHash)) {
    throw new EngineError(401, 'Runner 凭证无效');
  }
  return runner;
}

/** 从请求头解析 Runner 身份：x-runner-id + Bearer token */
export async function authenticateRunnerRequest(req: Request) {
  const runnerId = req.headers.get('x-runner-id');
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!runnerId || !token) throw new EngineError(401, '缺少 Runner 凭证');
  return authenticateRunnerToken(runnerId, token);
}

// ------------------------------------------------------------------
// 心跳摄入 + 指令调度
// ------------------------------------------------------------------

interface HeartbeatBody {
  probes?: VpnSnapshot;
  contentRoot?: string;
  dirs?: unknown;
}

export async function ingestHeartbeat(
  runnerId: string,
  body: HeartbeatBody,
): Promise<{ commands: unknown[] }> {
  const now = new Date();
  const heartbeatPayload = JSON.stringify({
    probes: body.probes ?? null,
    contentRoot: body.contentRoot ?? null,
    dirs: body.dirs ?? null,
  });

  const runner = await prisma.$transaction(async (tx) => {
    const r = await tx.contentOpsRunner.update({
      where: { id: runnerId },
      data: { status: 'online', lastSeenAt: now, lastHeartbeat: heartbeatPayload },
    });
    await appendEvent(
      { runnerId, agent: 'runner', type: 'heartbeat', payload: { probes: body.probes ?? null } },
      tx,
    );
    return r;
  });

  // waiting_runner 自动接上（Q14）：包含建 Run 时 Runner 离线（runnerId=null）的卡片——
  // 首个上报心跳的 Runner 以 CAS 抢占绑定，防多 Runner 重复接
  const waiting = await prisma.contentOpsRun.findMany({
    where: {
      status: RUN_STATE.WAITING_RUNNER,
      OR: [{ runnerId }, { runnerId: null }],
    },
  });
  for (const run of waiting) {
    await prisma.$transaction(async (tx) => {
      if (!run.runnerId) {
        const claimed = await tx.contentOpsRun.updateMany({
          where: { id: run.id, runnerId: null, status: RUN_STATE.WAITING_RUNNER },
          data: { runnerId: runnerId, currentOwner: ACTOR.HUMAN },
        });
        if (claimed.count === 0) return; // 已被其他 Runner 接上
        await appendEvent(
          { runId: run.id, runnerId, agent: 'control_plane', type: 'runner_claimed', payload: { runnerId } },
          tx,
        );
      }
      await transitionRun(tx, run, RUN_STATE.WAITING_ROUND1_SUBMISSION, 'runner heartbeat online');
    });
  }

  // S3 VPN 闸门：round1_archived 评估，vpn_check_failed 恢复评估
  const vpnGateRuns = await prisma.contentOpsRun.findMany({
    where: { runnerId, status: { in: [RUN_STATE.ROUND1_ARCHIVED, RUN_STATE.VPN_CHECK_FAILED] } },
  });
  for (const run of vpnGateRuns) {
    const claudeOk = body.probes?.endpoints?.claude?.reachable === true;
    const cnOk = body.probes?.endpoints?.cnBase?.reachable === true;
    if (claudeOk && cnOk) {
      await prisma.$transaction(async (tx) => {
        const s3 = await tx.contentOpsStep.findFirst({ where: { runId: run.id, code: 'S3' } });
        if (s3) {
          await tx.contentOpsStep.update({
            where: { id: s3.id },
            data: {
              status: STEP_STATUS.DONE,
              startedAt: s3.startedAt ?? now,
              finishedAt: now,
              evidence: JSON.stringify({ probes: body.probes, auto: 'heartbeat_vpn_gate' }),
            },
          });
        }
        if (run.status === RUN_STATE.VPN_CHECK_FAILED) {
          await transitionRun(tx, run, RUN_STATE.CLAUDE_MANUAL_STEP, 'vpn recovered via heartbeat');
        } else {
          await transitionRun(tx, run, RUN_STATE.CLAUDE_MANUAL_STEP, 'vpn gate passed');
        }
      });
    } else if (run.status === RUN_STATE.ROUND1_ARCHIVED) {
      await prisma.$transaction(async (tx) => {
        const s3 = await tx.contentOpsStep.findFirst({ where: { runId: run.id, code: 'S3' } });
        if (s3) {
          await tx.contentOpsStep.update({
            where: { id: s3.id },
            data: {
              status: STEP_STATUS.FAILED,
              startedAt: s3.startedAt ?? now,
              failureReason: cnOk ? 'Claude 端点不可达，请开启 VPN' : '国内参照点不可达，本机网络异常',
            },
          });
        }
        await transitionRun(tx, run, RUN_STATE.VPN_CHECK_FAILED, 'vpn gate failed');
      });
    }
  }

  return { commands: await dispatchCommands(runnerId) };
}

async function dispatchCommands(runnerId: string): Promise<unknown[]> {
  const queued = await prisma.contentOpsStep.findMany({
    where: {
      commandStatus: 'queued',
      run: { runnerId },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (queued.length === 0) return [];
  const ids = queued.map((s) => s.id);
  // CAS 抢占，防止多 Runner / 多重心跳重复下发
  await prisma.contentOpsStep.updateMany({
    where: { id: { in: ids }, commandStatus: 'queued' },
    data: { commandStatus: 'dispatched', dispatchedAt: new Date() },
  });
  return queued.map((s) => ({
    stepId: s.id,
    idempotencyKey: s.idempotencyKey,
    type: JSON.parse(s.commandPayload ?? '{}').type,
    payload: JSON.parse(s.commandPayload ?? '{}').payload ?? {},
  }));
}

// ------------------------------------------------------------------
// 指令结果回报
// ------------------------------------------------------------------

export async function handleCommandResult(runnerId: string, body: {
  stepId: string;
  idempotencyKey: string;
  status: 'done' | 'failed';
  result?: unknown;
  error?: string;
}) {
  const step = await prisma.contentOpsStep.findUnique({
    where: { id: body.stepId },
    include: { run: true },
  });
  if (!step || step.idempotencyKey !== body.idempotencyKey) {
    throw new EngineError(404, '指令不存在或幂等键不匹配');
  }
  if (step.run.runnerId !== runnerId) {
    throw new EngineError(403, '指令不属于该 Runner');
  }
  if (step.commandStatus !== 'dispatched' && step.commandStatus !== 'queued') {
    return { accepted: false, reason: `commandStatus=${step.commandStatus}` };
  }

  const payload = JSON.parse(step.commandPayload ?? '{}') as {
    type: string;
    payload: { files?: Array<{ relPath: string; kind: string; sourceType: string; note?: string }> };
  };

  if (body.status === 'failed') {
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify({ error: body.error ?? 'unknown' }),
          status: STEP_STATUS.FAILED,
          failureReason: body.error ?? 'Runner 回报失败',
          finishedAt: new Date(),
        },
      });
      if (step.run.status !== 'failed') {
        await transitionRun(tx, step.run, 'failed', `step ${step.code} command failed`);
      }
    });
    return { accepted: true };
  }

  const result = (body.result ?? {}) as Record<string, unknown>;
  await appendEvent({
    runId: step.runId,
    runnerId,
    agent: 'runner',
    type: 'result',
    payload: { step: step.code, command: payload.type, resultSummary: summarize(result) },
  });

  switch (payload.type) {
    case COMMAND.HASH_FILES:
      await handleHashFilesResult(step, payload, result);
      break;
    case COMMAND.SCAN_WORK_PACKAGES:
      if (step.code === 'S11') await handleAbsorbScanResult(step, result);
      else if (step.code === 'S14') await handleRound2UpdateScanResult(step, result);
      else await handleScanResult(step, result, runnerId);
      break;
    case COMMAND.LIST_MENTOR_FILES:
      await handleListMentorFilesResult(step, result);
      break;
    case COMMAND.LIST_WORK_FILES:
      await handleListWorkFilesResult(step, result);
      break;
    case COMMAND.PREPARE_CLAUDE_OUTPUTS:
      await handlePrepareClaudeOutputsResult(step, result);
      break;
    case COMMAND.CODEX_PROBE:
      await prisma.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify(result),
          evidence: JSON.stringify({ ...safeParse(step.evidence), codex: result.codex ?? null }),
        },
      });
      break;
    case COMMAND.LOCATE_VIEW_DOCS:
      await handleLocateViewDocsResult(step, payload as { payload: Record<string, unknown> }, result);
      break;
    case COMMAND.LOCATE_ROUND2_DOCS:
      await handleLocateRound2DocsResult(step, result);
      break;
    case COMMAND.READ_VIEW_DOCS:
      if (step.code === 'S15') await handleReadRound2DocsResult(step, result);
      else await handleReadViewDocsResult(step, result);
      break;
    case COMMAND.FEISHU_SEND_MESSAGE:
      await handleFeishuSendMessageResult(step, payload as { payload: Record<string, unknown> }, result);
      break;
    case COMMAND.FEISHU_LIST_MESSAGES:
      if (step.code === 'S13') await handleRound2MaterialScanResult(step, result);
      else await handleFeishuListMessagesResult(step, result, step.code === 'S16' ? 2 : 1);
      break;
    case COMMAND.FEISHU_DOWNLOAD_RESOURCE:
      if (step.code === 'S13') await handleRound2MaterialDownloadResult(step, result);
      else await handleFeishuDownloadReplyResult(step, result, step.code === 'S16' ? 2 : 1);
      break;
    case COMMAND.FEISHU_CHAT_INFO:
      await prisma.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify(result),
          evidence: JSON.stringify({ ...safeParse(step.evidence), botCheck: result.feishu ?? result }),
        },
      });
      break;
    case COMMAND.SCAN_FINAL_HANDOFF:
      await handleScanFinalHandoffResult(step, result);
      break;
    case COMMAND.PREFLIGHT_CHECKS:
      await handlePreflightChecksResult(step, result);
      break;
    case COMMAND.RESOLVE_PENDING_CARD:
      const pendingCardsResult = Array.isArray(result.pendingCards) ? result.pendingCards : [];
      await prisma.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify(result),
          evidence: JSON.stringify({ ...safeParse(step.evidence), pendingCards: pendingCardsResult }),
          ...(pendingCardsResult.length === 0 ? { status: STEP_STATUS.DONE, finishedAt: new Date() } : {}),
        },
      });
      break;
    // P4b：S21 集成六段 + S22 生产发布四段（同一 step 行轮转）
    case COMMAND.GIT_FETCH_STATUS:
      if (step.code === 'S21') await handleS21PhaseResult(step, payload as { payload: Record<string, unknown> }, result);
      else if (step.code === 'S22') await handleS22PhaseResult(step, payload as { payload: Record<string, unknown> }, result);
      else {
        await prisma.contentOpsStep.update({ where: { id: step.id }, data: { commandStatus: 'done', commandResult: JSON.stringify(result) } });
      }
      break;
    case COMMAND.GIT_BACKUP_CREATE:
    case COMMAND.GIT_INTEGRATE_HANDOFF:
    case COMMAND.RUN_REGRESSION_TESTS:
    case COMMAND.GIT_PUSH_MAIN:
    case COMMAND.DEPLOY_STAGING:
      await handleS21PhaseResult(step, payload as { payload: Record<string, unknown> }, result);
      break;
    case COMMAND.GIT_PROMOTE_MAIN_TO_MASTER:
    case COMMAND.DEPLOY_PRODUCTION:
      await handleS22PhaseResult(step, payload as { payload: Record<string, unknown> }, result);
      break;
    default:
      await prisma.contentOpsStep.update({
        where: { id: step.id },
        data: { commandStatus: 'done', commandResult: JSON.stringify(result) },
      });
  }
  return { accepted: true };
}

function safeParse(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function summarize(result: Record<string, unknown>): unknown {
  // 事件里不写绝对路径全文，只留计数与显示路径
  if (Array.isArray(result.results)) {
    return {
      count: result.results.length,
      ok: result.results.filter((r: { ok: boolean }) => r.ok).length,
      displayPaths: result.results
        .filter((r: { ok: boolean }) => r.ok)
        .map((r: { displayPath?: string }) => r.displayPath),
    };
  }
  if (Array.isArray(result.packages)) return { packageCount: result.packages.length };
  if (Array.isArray(result.files)) return { fileCount: result.files.length };
  return { keys: Object.keys(result) };
}

async function handleHashFilesResult(
  step: { id: string; runId: string; code: string; evidence: string | null; run: { id: string; status: string } },
  payload: { payload: { files?: Array<{ relPath: string; kind: string; sourceType: string; note?: string }> } },
  result: Record<string, unknown>,
) {
  const rows = (result.results ?? []) as Array<{
    path: string;
    finalPath?: string;
    displayPath?: string;
    sha256?: string;
    bytes?: string;
    ok: boolean;
    reason?: string;
  }>;
  const failed = rows.filter((r) => !r.ok);
  if (failed.length > 0) {
    // S13 归并稿补登失败不翻转步骤（步骤本体早已 done，补登只是附加动作）：
    // 记录失败原因到 evidence，步骤保持 done，run 也不进 failed
    if (step.code === 'S13') {
      const reason = `归并稿登记失败：${failed.map((f) => `${f.path}(${f.reason})`).join('；')}`;
      await prisma.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify(result),
          evidence: JSON.stringify({ ...safeParse(step.evidence), mergeError: reason }),
        },
      });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify(result),
          status: STEP_STATUS.FAILED,
          failureReason: `文件哈希失败：${failed.map((f) => `${f.path}(${f.reason})`).join('；')}`,
          finishedAt: new Date(),
        },
      });
      if (step.run.status !== 'failed') {
        await transitionRun(tx, step.run, 'failed', `step ${step.code} hash failed`);
      }
    });
    return;
  }

  const files = payload.payload.files ?? [];
  await prisma.$transaction(async (tx) => {
    for (const f of files) {
      const row = rows.find((r) => r.displayPath === f.relPath || r.path.endsWith(f.relPath));
      if (!row?.sha256 || !row.bytes) throw new EngineError(400, `缺少哈希结果: ${f.relPath}`);
      // by sonnet 规范命名后落库用最终路径（未重命名时 finalPath 与 path 相同/缺省）
      const storedPath = row.finalPath ?? row.path;
      const existing = await tx.contentOpsArtifact.findUnique({
        where: { runId_path: { runId: step.runId, path: storedPath } },
      });
      if (existing) {
        if (existing.sha256 !== row.sha256) {
          throw new EngineError(409, `文件内容已变化且曾被登记，禁止覆盖：${f.relPath}`);
        }
        continue;
      }
      await tx.contentOpsArtifact.create({
        data: {
          runId: step.runId,
          kind: f.kind,
          path: storedPath,
          displayPath: row.displayPath ?? f.relPath,
          sha256: row.sha256,
          bytes: BigInt(row.bytes),
          sourceType: f.sourceType,
          provenance: JSON.stringify({ registeredByStep: step.code, note: f.note ?? null }),
          validationStatus: 'verified',
          immutable: f.sourceType === 'primary',
        },
      });
    }
    await appendEvent(
      {
        runId: step.runId,
        agent: 'runner',
        type: 'result',
        payload: { step: step.code, registered: files.map((f) => ({ kind: f.kind, path: f.relPath })) },
      },
      tx,
    );
  });

  // 按步骤收敛业务状态
  const def = getStepDef(step.code);
  if (step.code === 'S5') {
    // 产物已登记，但必须等人勾选 R3 才允许完成 S5
    await prisma.contentOpsStep.update({
      where: { id: step.id },
      data: {
        commandStatus: 'done',
        commandResult: JSON.stringify(result),
        status: STEP_STATUS.WAITING_HUMAN,
        finishedAt: new Date(),
        evidence: JSON.stringify({ ...safeParse(step.evidence), hashRegistered: true }),
      },
    });
    return;
  }
  if (step.code === 'S7') {
    // 00_START_HERE 哈希成功 = Assembly 包核验通过
    await finishStepAndAdvance(step, def.nextRunState, result, { alsoDone: ['S6'] });
    return;
  }
  if (step.code === 'S13') {
    // 二轮材料归档完成后补登归并产物：只注册 artifact，不推进状态（步骤与 run 都已在目标态）
    const manifest = files.map((f, i) => {
      const row = rows.find((r) => r.displayPath === f.relPath || r.path.endsWith(f.relPath));
      return { kind: f.kind, relPath: f.relPath, sha256: row?.sha256 ?? null, bytes: Number(row?.bytes) || 0, order: i };
    });
    await prisma.contentOpsStep.update({
      where: { id: step.id },
      data: {
        // 归并登记只是补登产物：步骤保持 done，不翻转成 waiting/running；成功则清除上次 mergeError
        status: STEP_STATUS.DONE,
        commandStatus: 'done',
        commandResult: JSON.stringify(result),
        evidence: JSON.stringify({ ...safeParse(step.evidence), mergeError: null, mergeManifest: manifest, mergedAt: new Date().toISOString() }),
      },
    });
    return;
  }
  if (step.code === 'S16') {
    // S16 = 归档 + Codex 最终吸收同一卡片：手工哈希归档后保持等待人工，不结束步骤
    const updatedStep = await prisma.contentOpsStep.findUniqueOrThrow({ where: { id: step.id } });
    const stepEvidence = safeParse(updatedStep.evidence);
    const manualSel = (stepEvidence.replySelectionRound2 as { destName?: string } | undefined)?.destName ?? null;
    const archived = {
      round: 2 as const,
      fileName: manualSel,
      destName: manualSel,
      senderName: '人工登记',
      messageId: null,
      createTime: null,
      manual: true,
      bytes: rows.reduce((sum, r) => sum + (Number(r.bytes) || 0), 0),
      sha256: rows.length === 1 ? (rows[0].sha256 ?? null) : null,
      archivedAt: new Date().toISOString(),
    };
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify({ archived }),
          status: STEP_STATUS.WAITING_HUMAN,
          evidence: JSON.stringify({ ...stepEvidence, archivedReplyRound2: archived }),
        },
      });
      const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
      if (fresh.status !== RUN_STATE.ROUND2_REPLY_RECEIVED) {
        await transitionRun(tx, fresh, RUN_STATE.ROUND2_REPLY_RECEIVED, 'S16 第二轮回复手工归档完成');
      }
    });
    return;
  }
  await finishStepAndAdvance(step, def.nextRunState, result);
}

async function handleScanResult(
  step: { id: string; runId: string; code: string },
  result: Record<string, unknown>,
  runnerId: string,
) {
  const packages = (result.packages ?? []) as Array<{ name: string; hasStartHere: boolean }>;
  const valid = packages.filter((p) => p.hasStartHere).map((p) => p.name);
  if (valid.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify(result),
          status: STEP_STATUS.FAILED,
          failureReason: '未在 work 目录找到含 00_START_HERE.md 的版本包',
        },
      });
      const run = await tx.contentOpsRun.findUnique({ where: { id: step.runId } });
      if (run && run.status !== 'failed') {
        await transitionRun(tx, run, 'failed', 'S7 no work package');
      }
    });
    return;
  }
  // P1：取名称排序最后一个版本包；记录选择依据，页面可见、可回退人工
  const chosen = valid.sort()[valid.length - 1];
  const run = await prisma.contentOpsRun.findUniqueOrThrow({
    where: { id: step.runId },
    include: { runner: true },
  });
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) {
    throw new EngineError(409, 'Runner 心跳未携带 CONTENT_ROOT，无法衔接 START_HERE 核验');
  }
  const relStartHere = `mentors/${run.mentorDir}/work/${chosen}/00_START_HERE.md`;
  const files = [
    { relPath: relStartHere, kind: 'codex_work_package', sourceType: 'generated', note: chosen },
  ];
  const items = [{ path: `${contentRoot}\\${relStartHere.replace(/\//g, '\\')}` }];
  // 链式指令：scan 刚回报（commandStatus=dispatched），同一步骤重新置 queued 下发 START_HERE 哈希
  // 兼容已落 done 的场景；queued/done(hash) 不匹配，天然防重复入队
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['dispatched', 'done'] } },
    data: {
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.HASH_FILES, payload: { files, items } }),
      evidence: JSON.stringify({ packages, chosenPackage: chosen, policy: 'name_sort_last_p1' }),
    },
  });
  if (updated.count === 0) {
    throw new EngineError(409, 'S7 链式核验入队失败（指令状态异常）');
  }
  void runnerId;
}

/**
 * S1「扫描+勾选」结果：候选文件清单只写入步骤 evidence 供页面勾选，
 * 指令置 done 但步骤状态保持 running、Run 状态不推进——必须等用户勾选后走哈希登记。
 * Runner 上报一律视为候选：这里只做路径边界与类型白名单的轻校验，
 * 类型/勾选的最终权威在 observeFiles + 哈希成功。
 */
async function handleListMentorFilesResult(
  step: { id: string; evidence: string | null; run: { mentorDir: string } },
  result: Record<string, unknown>,
) {
  const prefix = `mentors/${step.run.mentorDir}/`.toLowerCase();
  const allowedKinds = new Set(['source_audio', 'source_transcript']);
  const raw = Array.isArray(result.files) ? result.files : [];
  const files = raw
    .map((f) => {
      const r = (f ?? {}) as Record<string, unknown>;
      const relPath = String(r.relPath ?? '').replace(/\\/g, '/');
      const kind = String(r.suggestedKind ?? '');
      return {
        relPath,
        bytes: Number.isFinite(Number(r.bytes)) ? Number(r.bytes) : 0,
        mtimeMs: Number.isFinite(Number(r.mtimeMs)) ? Number(r.mtimeMs) : 0,
        suggestedKind: allowedKinds.has(kind) ? kind : null,
      };
    })
    .filter((f) => f.relPath.toLowerCase().startsWith(prefix) && !f.relPath.includes('/../'))
    .slice(0, 300);

  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({ count: files.length }),
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        scanFiles: files,
        scannedAt: new Date().toISOString(),
      }),
    },
  });
}

async function handleListWorkFilesResult(
  step: { id: string; evidence: string | null; run: { mentorDir: string } },
  result: Record<string, unknown>,
) {
  const prefix = `mentors/${step.run.mentorDir}/`.toLowerCase();
  const allowedKinds = new Set(['merged_audio', 'normalized_md']);
  const raw = Array.isArray(result.files) ? result.files : [];
  const files = raw
    .map((f) => {
      const r = (f ?? {}) as Record<string, unknown>;
      const relPath = String(r.relPath ?? '').replace(/\\/g, '/');
      const kind = String(r.suggestedKind ?? '');
      return {
        relPath,
        bytes: Number.isFinite(Number(r.bytes)) ? Number(r.bytes) : 0,
        mtimeMs: Number.isFinite(Number(r.mtimeMs)) ? Number(r.mtimeMs) : 0,
        suggestedKind: allowedKinds.has(kind) ? kind : null,
      };
    })
    .filter((f) => f.relPath.toLowerCase().startsWith(prefix) && !f.relPath.includes('/../'))
    .slice(0, 300);

  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({ count: files.length }),
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        scanFiles: files,
        scannedAt: new Date().toISOString(),
      }),
    },
  });
}

async function handlePrepareClaudeOutputsResult(
  step: { id: string; evidence: string | null; run: { mentorDir: string } },
  result: Record<string, unknown>,
) {
  const prefix = `mentors/${step.run.mentorDir}/`.toLowerCase();
  const raw = Array.isArray(result.files) ? result.files : [];
  const files = raw
    .map((f) => {
      const r = (f ?? {}) as Record<string, unknown>;
      const relPath = String(r.relPath ?? '').replace(/\\/g, '/');
      return {
        relPath,
        bytes: Number.isFinite(Number(r.bytes)) ? Number(r.bytes) : 0,
        mtimeMs: Number.isFinite(Number(r.mtimeMs)) ? Number(r.mtimeMs) : 0,
        renamed: r.renamed === true,
        suggestedKind: 'claude_output',
      };
    })
    .filter((f) => f.relPath.toLowerCase().startsWith(prefix) && !f.relPath.includes('/../'))
    .slice(0, 50);

  // 只记候选不改步骤状态：S5 可能已在 waiting_human 等 R3，扫描仅补充/刷新候选
  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({ count: files.length }),
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        scanFiles: files,
        scannedAt: new Date().toISOString(),
      }),
    },
  });
}

// ------------------------------------------------------------------
// S8 / S9：第一轮阅览文件定位比对 + G1 批准发送（P2a）
// ------------------------------------------------------------------

/** 旧 Run 的步骤行按需补建（P1 建 Run 时只造了 S0-S7 行，P2a 激活 S8/S9） */
async function ensureStepRows(runId: string, codes: string[]) {
  for (const code of codes) {
    const existing = await prisma.contentOpsStep.findFirst({ where: { runId, code } });
    if (existing) continue;
    const def = getStepDef(code);
    await prisma.contentOpsStep.create({
      data: {
        runId,
        code,
        actor: def.actor,
        title: def.title,
        status: STEP_STATUS.PENDING,
        idempotencyKey: `${runId}:${code}:init:${randomBytes(4).toString('hex')}`,
      },
    });
  }
}

export async function startRound1DocsQc(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.ROUND1_DOCS_QC, RUN_STATE.ROUND1_DOCS_QC_FAILED];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能发起第一轮阅览文件比对`);
  }
  await ensureStepRows(runId, ['S8', 'S9']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S8' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.LOCATE_VIEW_DOCS, payload: { mentorDir: run.mentorDir } }),
      idempotencyKey: `${runId}:S8:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S8 已有指令在执行中，请等待完成或失败后再试');

  if (run.status === RUN_STATE.ROUND1_DOCS_QC_FAILED) {
    // 干预态恢复主线（比对未通过后重扫）
    await transitionRun(prisma, run, RUN_STATE.ROUND1_DOCS_QC, '重新发起第一轮阅览文件定位比对');
  }
  await audit(userId, 'content_ops.start_round1_docs_qc', runId, { mentorDir: run.mentorDir });
  return { queued: true };
}

/** 定位结果：唯一确定的两份登记为 review_doc 产物，其余（歧义/参考）只进证据 */
async function handleLocateViewDocsResult(
  step: { id: string; runId: string; code: string; evidence: string | null; run: { id: string; status: string } },
  payload: { payload: Record<string, unknown> },
  result: Record<string, unknown>,
) {
  const mentorDir = typeof payload.payload.mentorDir === 'string' ? payload.payload.mentorDir : null;
  const prefix = `mentors/${mentorDir ?? 'unknown'}/`.toLowerCase();
  const shapeDoc = (d: Record<string, unknown>) => {
    const rel = typeof d.relPath === 'string' ? d.relPath.replace(/\\/g, '/') : null;
    if (!rel) return null;
    return {
      relPath: rel,
      absPath: typeof d.absPath === 'string' ? d.absPath : null,
      docType: d.docType === 'review_checklist' ? 'review_checklist' : 'style_analysis',
      version: typeof d.version === 'string' ? d.version : null,
      bytes: Number(d.bytes ?? 0) || 0,
      sha256: typeof d.sha256 === 'string' ? d.sha256 : null,
      refMentor: typeof d.refMentor === 'string' ? d.refMentor : null,
    };
  };
  type LocatedDoc = NonNullable<ReturnType<typeof shapeDoc>>;
  const allDocs = ((Array.isArray(result.docs) ? result.docs : []) as Record<string, unknown>[]).map(shapeDoc).filter(Boolean) as LocatedDoc[];
  const refs = ((Array.isArray(result.refs) ? result.refs : []) as Record<string, unknown>[]).map(shapeDoc).filter(Boolean) as LocatedDoc[];
  const docs = allDocs.filter((d) => d.relPath.toLowerCase().startsWith(prefix));
  const styleDocs = docs.filter((d) => d.docType === 'style_analysis');
  const checklistDocs = docs.filter((d) => d.docType === 'review_checklist');
  const missing = [styleDocs.length === 0 ? '语言人格风格分析' : null, checklistDocs.length === 0 ? '第一轮审核清单' : null].filter(Boolean) as string[];
  const ambiguous = styleDocs.length > 1 || checklistDocs.length > 1;
  // 重新定位意味着候选/参考可能已修订：旧 AI 评分与裁决一律作废，不与新 locate 共存
  const evidence = {
    locate: { docs, refs, missing, ambiguous, locatedAt: new Date().toISOString() },
  };

  if (missing.length > 0) {
    // S8 不通过 → round1_docs_qc_failed（显示差异项），可重扫或回滚 Assembly
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify({ docCount: docs.length, refCount: refs.length }),
          status: STEP_STATUS.FAILED,
          finishedAt: new Date(),
          failureReason: `未在 work 目录定位到：${missing.join('、')}（命名约定 <Display_Name>_语言人格风格分析/第一轮审核清单_v<版本>.md）`,
          evidence: JSON.stringify(evidence),
        },
      });
      const run = await tx.contentOpsRun.findUnique({ where: { id: step.runId } });
      if (run && run.status === RUN_STATE.ROUND1_DOCS_QC) {
        await transitionRun(tx, run, RUN_STATE.ROUND1_DOCS_QC_FAILED, `S8 阅览文件缺失：${missing.join('、')}`);
      }
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (!ambiguous) {
      for (const doc of [...styleDocs, ...checklistDocs]) {
        if (!doc.absPath || !doc.sha256) continue;
        const existing = await tx.contentOpsArtifact.findUnique({
          where: { runId_path: { runId: step.runId, path: doc.absPath } },
        });
        if (existing) {
          if (existing.sha256 !== doc.sha256) {
            throw new EngineError(409, `文件内容已变化且曾被登记，禁止覆盖：${doc.relPath}`);
          }
          continue;
        }
        await tx.contentOpsArtifact.create({
          data: {
            runId: step.runId,
            kind: 'review_doc',
            path: doc.absPath,
            displayPath: doc.relPath,
            sha256: doc.sha256,
            bytes: BigInt(doc.bytes),
            sourceType: 'generated',
            provenance: JSON.stringify({ registeredByStep: 'S8', docType: doc.docType, docVersion: doc.version }),
            validationStatus: 'verified',
          },
        });
      }
    }
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        commandStatus: 'done',
        commandResult: JSON.stringify({ docCount: docs.length, refCount: refs.length, ambiguous }),
        status: STEP_STATUS.WAITING_HUMAN,
        finishedAt: new Date(),
        evidence: JSON.stringify(evidence),
        ...(ambiguous ? { failureReason: '候选文件歧义（多于一份），请人工确认后重新发起' } : {}),
      },
    });
  });
}

/**
 * S8 第二跳：发起 AI 比对。Runner 读回 2 份待审 + 6 份参考正文，
 * 控制平面调 DeepSeek 按四维 rubric 评分（方案 C）。
 */
export async function startAiCompare(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.ROUND1_DOCS_QC, RUN_STATE.ROUND1_DOCS_QC_FAILED];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能发起 AI 比对`);
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S8' } });
  const ev = safeParse(step.evidence);
  const locate = ev.locate as
    | {
        docs?: Array<{ absPath: string; sha256: string; docType: string; refMentor?: string | null }>;
        refs?: Array<{ absPath: string; sha256: string; docType: string; refMentor?: string | null }>;
        ambiguous?: boolean;
      }
    | undefined;
  if (!locate || locate.ambiguous || !Array.isArray(locate.docs) || locate.docs.length !== 2) {
    throw new EngineError(409, '定位未完成、仍有歧义或待审文件不是 2 份，不能发起 AI 比对');
  }
  // 参考集必须是 3 位参考导师 × 2 类共 6 份（旧定位证据可能是参考集定型前的 5 份，必须重扫）
  const refs = locate.refs ?? [];
  const refPairs = new Set(refs.map((r) => `${r.refMentor ?? ''}::${r.docType}`));
  if (refs.length !== 6 || refPairs.size !== 6) {
    throw new EngineError(409, `参考集不是 6 份定型参考（当前 ${refs.length} 份），请重新发起定位后再做 AI 比对`);
  }
  const runnerOnline = (run.runner?.lastSeenAt?.getTime() ?? 0) > Date.now() - RUNNER_ONLINE_MS;
  if (!runnerOnline) throw new EngineError(409, 'Runner 离线，无法读取文件正文');

  const items = [...locate.docs, ...refs].map((d) => ({
    absPath: d.absPath,
    sha256: d.sha256,
    docType: d.docType,
    refMentor: d.refMentor ?? null,
  }));
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['done', 'failed'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.READ_VIEW_DOCS, payload: { items } }),
      idempotencyKey: `${runId}:S8AI:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'AI 比对指令已在执行中，请等待结果');

  if (run.status === RUN_STATE.ROUND1_DOCS_QC_FAILED) {
    await transitionRun(prisma, run, RUN_STATE.ROUND1_DOCS_QC, '重新发起 S8 AI 比对');
  }
  await audit(userId, 'content_ops.start_ai_compare', runId, { itemCount: items.length });
  return { queued: true, itemCount: items.length };
}

type ReadDocResultItem = {
  absPath: string;
  relPath: string;
  docType: string;
  refMentor?: string | null;
  sha256: string;
  bytes?: number;
  content: string;
};

/** read_view_docs 结果：校验 → 两份待审并行 AI 评分 → 分数入证据（正文绝不落库）→ 等人工裁决 */
async function handleReadViewDocsResult(
  step: { id: string; runId: string; code: string; evidence: string | null; run: { id: string; status: string } },
  result: Record<string, unknown>,
) {
  const evidence = safeParse(step.evidence);
  const failCompare = async (reason: string) => {
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify({ error: reason }),
          status: STEP_STATUS.FAILED,
          finishedAt: new Date(),
          failureReason: reason,
        },
      });
      const fresh = await tx.contentOpsRun.findUnique({ where: { id: step.runId } });
      if (fresh && fresh.status === RUN_STATE.ROUND1_DOCS_QC) {
        await transitionRun(tx, fresh, RUN_STATE.ROUND1_DOCS_QC_FAILED, `S8 AI 比对失败：${reason}`);
      }
    });
  };

  const locate = evidence.locate as
    | {
        docs?: Array<{ absPath: string; relPath: string; sha256: string; docType: string }>;
        refs?: Array<{ absPath: string; relPath: string; sha256: string; docType: string; refMentor?: string | null }>;
        ambiguous?: boolean;
      }
    | undefined;
  if (!locate || locate.ambiguous || !Array.isArray(locate.docs)) {
    await failCompare('定位证据缺失或仍有歧义');
    return;
  }
  const items = (Array.isArray(result.results) ? result.results : []) as ReadDocResultItem[];
  const expected = [...(locate.docs ?? []), ...(locate.refs ?? [])];
  if (items.length !== expected.length) {
    await failCompare(`回传文件数量不符（${items.length}/${expected.length}）`);
    return;
  }
  const byAbs = new Map(items.map((i) => [i.absPath, i]));
  for (const d of expected) {
    const it = byAbs.get(d.absPath);
    if (!it || typeof it.content !== 'string') {
      await failCompare(`缺少文件正文：${d.relPath}`);
      return;
    }
    if (it.sha256 !== d.sha256) {
      await failCompare(`正文哈希与定位登记不一致：${d.relPath}`);
      return;
    }
  }
  const candidates = items.filter((i) => !i.refMentor);
  const refs = items.filter((i) => i.refMentor);
  if (candidates.length !== 2) {
    await failCompare(`待审文件应为 2 份，实际 ${candidates.length}`);
    return;
  }

  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
  let scored: DocCompareResult[];
  try {
    scored = await Promise.all(
      candidates.map((it) =>
        scoreViewDoc({
          docType: it.docType === 'review_checklist' ? 'review_checklist' : 'style_analysis',
          mentorDir: run.mentorDir,
          isPilot: Boolean(run.isPilot),
          candidate: { relPath: it.relPath, content: it.content },
          refs: refs
            .filter((r) => r.docType === it.docType)
            .map((r) => ({ refMentor: r.refMentor ?? '', relPath: r.relPath, content: r.content })),
        }),
      ),
    );
  } catch (e) {
    await failCompare(e instanceof Error ? e.message : 'AI 评分失败');
    return;
  }

  const aiPass = allDocsPass(scored);
  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      // 只落评分摘要，绝不落文件正文
      commandResult: JSON.stringify({ files: scored.map((s) => ({ relPath: s.relPath, scores: s.scores })) }),
      status: STEP_STATUS.WAITING_HUMAN,
      finishedAt: new Date(),
      failureReason: aiPass ? null : 'AI 比对存在低于 80% 的维度，等待人工裁决',
      evidence: JSON.stringify({
        ...evidence,
        compare: { results: scored, aiPass, at: new Date().toISOString() },
      }),
    },
  });
}

/**
 * S8 人工裁决（AI 评分为证据，决定权在人）：
 * - pass：AI 全过时直接放行；有维度 <80 仍允许人工 override，但必须填 ≥10 字说明留痕
 * - reject：必须填 ≥5 字原因，该原因带回 Codex 对话要求修订（Trae 不改正文）
 */
export async function submitRound1Qc(
  userId: string,
  runId: string,
  input: { decision?: string; note?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.ROUND1_DOCS_QC) {
    throw new EngineError(409, `当前状态（${run.status}）不能提交比对裁决`);
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S8' } });
  const evidence = safeParse(step.evidence);
  const compare = evidence.compare as
    | { results: DocCompareResult[]; aiPass: boolean; at: string }
    | undefined;
  if (!compare) throw new EngineError(409, '尚未完成 AI 比对，不能提交裁决');
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const decision = input.decision;

  if (decision === 'reject') {
    if (note.length < 5) {
      throw new EngineError(400, '驳回必须填写具体原因（至少 5 个字），用于在 Codex 对话中要求修订');
    }
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          status: STEP_STATUS.FAILED,
          finishedAt: new Date(),
          failureReason: `人工驳回：${note}`,
          evidence: JSON.stringify({
            ...evidence,
            qc: { decision: 'reject', note, decidedBy: userId, decidedAt: new Date().toISOString() },
          }),
        },
      });
      const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
      await transitionRun(tx, fresh, RUN_STATE.ROUND1_DOCS_QC_FAILED, `S8 人工驳回：${note}`);
    });
    await audit(userId, 'content_ops.submit_round1_qc', runId, { verdict: 'reject' });
    return { ok: true, verdict: 'reject' };
  }

  if (decision !== 'pass') throw new EngineError(400, '裁决结论必须是 pass 或 reject');
  const overridden = !compare.aiPass;
  if (overridden && note.length < 10) {
    throw new EngineError(400, 'AI 评定有维度低于 80%，人工放行必须填写依据说明（至少 10 个字）');
  }
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        finishedAt: new Date(),
        failureReason: null,
        evidence: JSON.stringify({
          ...evidence,
          qc: {
            decision: 'pass',
            aiPass: compare.aiPass,
            overridden,
            note: note || null,
            decidedBy: userId,
            decidedAt: new Date().toISOString(),
          },
        }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status !== RUN_STATE.AWAITING_SEND_APPROVAL_ROUND1_DOCS) {
      await transitionRun(tx, fresh, RUN_STATE.AWAITING_SEND_APPROVAL_ROUND1_DOCS, overridden ? 'S8 人工 override AI 结论放行' : 'S8 AI 比对通过');
    }
  });
  await audit(userId, 'content_ops.submit_round1_qc', runId, { verdict: 'pass', overridden });
  return { ok: true, verdict: 'pass', overridden };
}

/** S9 发送清单：①风格分析（浏览用）→②审核清单（需回复）→③G1 固定文案；幂等键按内容+序号确定，重试去重 */
async function buildS9SendPayload(runId: string, chatId: string, index: number, dedupBase: string) {
  const idempotencyKey = `${runId}:S9:${sha256Text(dedupBase).slice(0, 8)}:${index}`.slice(0, 50);
  if (index >= 2) {
    return { chatId, kind: 'text', text: G1_ROUND1_DOCS_TEXT, sendIndex: 2, idempotencyKey };
  }
  const docs = await prisma.contentOpsArtifact.findMany({ where: { runId, kind: 'review_doc' }, orderBy: { createdAt: 'asc' } });
  const ordered = [...docs].sort(
    (a, b) => Number(String(b.provenance ?? '').includes('review_checklist')) - Number(String(a.provenance ?? '').includes('review_checklist')),
  );
  const doc = ordered[index];
  if (!doc) throw new EngineError(409, `S9 发送清单缺少第 ${index + 1} 份阅览文件`);
  return {
    chatId,
    kind: 'file',
    srcDirAbs: path.dirname(doc.path),
    fileName: path.basename(doc.path),
    expectedSha: doc.sha256,
    label: doc.displayPath,
    sendIndex: index,
    idempotencyKey,
  };
}

export async function approveSendRound1Docs(
  userId: string,
  runId: string,
  input: { confirm?: { filesRead?: boolean; qcSeen?: boolean; chatConfirmed?: boolean; copyUnchanged?: boolean } },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  if (run.status !== RUN_STATE.AWAITING_SEND_APPROVAL_ROUND1_DOCS) {
    throw new EngineError(409, `当前状态（${run.status}）不能批准发送第一轮阅览文件`);
  }
  const c = {
    filesRead: input.confirm?.filesRead === true,
    qcSeen: input.confirm?.qcSeen === true,
    chatConfirmed: input.confirm?.chatConfirmed === true,
    copyUnchanged: input.confirm?.copyUnchanged === true,
  };
  if (!Object.values(c).every(Boolean)) throw new EngineError(409, '证据核对勾未完成（四项须全部勾选）');
  await ensureStepRows(runId, ['S9']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  if (!run.feishuChatId) throw new EngineError(409, 'Run 未绑定飞书群，禁止发送');

  const docCount = await prisma.contentOpsArtifact.count({ where: { runId, kind: 'review_doc' } });
  if (docCount !== 2) throw new EngineError(409, `第一轮阅览文件应为 2 份（当前登记 ${docCount} 份），禁止发送`);

  const reviewDocs = await prisma.contentOpsArtifact.findMany({ where: { runId, kind: 'review_doc' }, orderBy: { createdAt: 'asc' } });
  const dedupBase = `g1:${run.feishuChatId}:${reviewDocs.map((d) => d.sha256.slice(0, 12)).sort().join(':')}`;
  const dup = await prisma.contentOpsFeishuMessage.findFirst({
    where: { dedupKey: { startsWith: dedupBase }, status: 'sent' },
  });
  if (dup) throw new EngineError(409, `该内容已发送过（dedup=${dedupBase}），禁止重复发送`);

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S9' } });
  const firstPayload = await buildS9SendPayload(runId, run.feishuChatId, 0, dedupBase);
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.FEISHU_SEND_MESSAGE, payload: firstPayload }),
      idempotencyKey: `${runId}:S9:${randomBytes(6).toString('hex')}`,
      failureReason: null,
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        sendPlan: [
          { kind: 'file', label: '语言人格风格分析（浏览用）' },
          { kind: 'file', label: '第一轮审核清单（需回复）' },
          { kind: 'text', label: 'G1 固定文案' },
        ],
        dedupKeyBase: dedupBase,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        sendLog: [],
      }),
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S9 已有发送指令在执行中');

  await prisma.contentOpsApproval.create({
    data: {
      runId,
      gate: 'G1',
      stepCode: 'S9',
      buttonName: '批准发送：第一轮阅览文件',
      scope: `仅本次向群 ${run.feishuChatName ?? run.feishuChatId} 发送 2 份阅览文件 + 1 条 G1 固定文案`,
      checks: JSON.stringify(c),
      status: 'approved',
      actorId: userId,
    },
  });
  for (let i = 0; i < 3; i += 1) {
    await prisma.contentOpsFeishuMessage.create({
      data: {
        runId,
        dedupKey: `${dedupBase}#${i}`,
        chatId: run.feishuChatId,
        direction: 'outbound',
        templateId: i === 2 ? 'g1_round1_docs_text' : null,
        status: 'pending',
        createdBy: 'runner',
      },
    });
  }
  await audit(userId, 'content_ops.approve_send_round1_docs', runId, { gate: 'G1', dedupBase });
  return { queued: true };
}

/**
 * 由 mentorDir 反查导师中文名（用于 G3 富文本 @mention 的 user_name 字段）。
 * mentorDir 形如 "ying wang pilot"，导师 name 形如 "Ying Wang"，按小写 includes 匹配；
 * 按名称长度降序遍历，避免 "freya" 与 "freyagao" 类子串歧义。fallback 顺序：chineseName → name → "导师"。
 */
function resolveMentorChineseName(mentorDir: string): string {
  const dir = String(mentorDir || '').toLowerCase();
  if (!dir) return '导师';
  const sorted = [...mentors].sort((a, b) => String(b.name).length - String(a.name).length);
  for (const m of sorted) {
    const n = String(m.name || '').toLowerCase();
    if (n && dir.includes(n)) {
      return m.chineseName ?? m.name ?? '导师';
    }
  }
  return '导师';
}

/** S15 发送清单：①第二轮审核清单文件 →②G3 固定文案 */
async function buildS15SendPayload(runId: string, chatId: string, index: number, dedupBase: string) {
  const idempotencyKey = `${runId}:S15:${sha256Text(dedupBase).slice(0, 8)}:${index}`.slice(0, 50);
  if (index >= 1) {
    // G3：post 富文本，@mention 群里导师（Runner 排除法定位 open_id），后接固定文案正文
    const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    const mentorName = resolveMentorChineseName(run.mentorDir);
    return {
      chatId,
      kind: 'text_mention',
      mentionMentorName: mentorName,
      bodyText: G3_ROUND2_DOCS_BODY,
      sendIndex: 1,
      idempotencyKey,
    };
  }
  const docs = await prisma.contentOpsArtifact.findMany({ where: { runId, kind: 'round2_review_doc' } });
  const doc = docs[0];
  if (!doc) throw new EngineError(409, 'S15 缺少第二轮审核清单产物');
  return {
    chatId,
    kind: 'file',
    srcDirAbs: path.dirname(doc.path),
    fileName: path.basename(doc.path),
    expectedSha: doc.sha256,
    label: doc.displayPath,
    sendIndex: 0,
    idempotencyKey,
  };
}

/** S12 唯一条目：G2 固定文案（含官方大纲链接） */
function buildS12SendPayload(runId: string, chatId: string, index: number, dedupBase: string) {
  const idempotencyKey = `${runId}:S12:${sha256Text(dedupBase).slice(0, 8)}:${index}`.slice(0, 50);
  return { chatId, kind: 'text', text: G2_OUTLINE_MESSAGE, sendIndex: 0, idempotencyKey };
}

/** 三个发送步骤（S9/S12/S15）共用链式结果处理：逐条回执 → 全部完成后推进主线 */
async function handleFeishuSendMessageResult(
  step: { id: string; runId: string; code: string; evidence: string | null; run: { id: string; status: string } },
  payload: { payload: Record<string, unknown> },
  result: Record<string, unknown>,
) {
  const chainCfg: Record<
    string,
    {
      total: number;
      textLabel: string;
      build: (runId: string, chatId: string, index: number, dedupBase: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
      sentState: string;
      waitingState: string;
      waitingReason: string;
    }
  > = {
    S9: {
      total: 3,
      textLabel: 'G1 固定文案',
      build: buildS9SendPayload,
      sentState: RUN_STATE.ROUND1_DOCS_SENT,
      waitingState: RUN_STATE.WAITING_ROUND1_REVIEW_REPLY,
      waitingReason: 'S9 发送完成，等待导师回复',
    },
    S12: {
      total: 1,
      textLabel: 'G2 第二轮大纲',
      build: buildS12SendPayload,
      sentState: RUN_STATE.ROUND2_OUTLINE_SENT,
      waitingState: RUN_STATE.WAITING_ROUND2_SUBMISSION,
      waitingReason: 'S12 大纲发送完成，等待第二轮访谈材料',
    },
    S15: {
      total: 2,
      textLabel: 'G3 固定文案',
      build: buildS15SendPayload,
      sentState: RUN_STATE.ROUND2_DOCS_SENT,
      waitingState: RUN_STATE.WAITING_ROUND2_REVIEW_REPLY,
      waitingReason: 'S15 发送完成，等待第二轮审核清单回复',
    },
  };
  const cfg = chainCfg[step.code];
  if (!cfg) throw new EngineError(409, `未知发送步骤: ${step.code}`);

  const idx = Number(payload.payload.sendIndex ?? 0);
  const kind = typeof payload.payload.kind === 'string' ? payload.payload.kind : 'unknown';
  const fileName = typeof payload.payload.fileName === 'string' ? payload.payload.fileName : null;
  const evidence = safeParse(step.evidence) as {
    sendLog?: Array<Record<string, unknown>>;
    dedupKeyBase?: string;
  };
  const sendLog = Array.isArray(evidence.sendLog) ? evidence.sendLog : [];
  sendLog.push({
    index: idx,
    kind,
    label: kind === 'text' ? cfg.textLabel : fileName,
    messageId: typeof result.messageId === 'string' ? result.messageId : null,
    at: new Date().toISOString(),
  });

  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify(result),
      evidence: JSON.stringify({ ...evidence, sendLog }),
    },
  });
  if (evidence.dedupKeyBase) {
    await prisma.contentOpsFeishuMessage.updateMany({
      where: { runId: step.runId, dedupKey: `${evidence.dedupKeyBase}#${idx}` },
      data: { status: 'sent', messageId: typeof result.messageId === 'string' ? result.messageId : null, sentAt: new Date() },
    });
  }

  const nextIndex = idx + 1;
  if (nextIndex >= cfg.total || !evidence.dedupKeyBase) {
    await finishStepAndAdvance(step, cfg.sentState as never, result);
    const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
    if (run.status === cfg.sentState) {
      await transitionRun(prisma, run, cfg.waitingState, cfg.waitingReason);
    }
    return;
  }
  // 链式下发下一条；发送内容按 dedup 键与序号重建，不依赖前序结果
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
  if (!run.feishuChatId) throw new EngineError(409, 'Run 未绑定飞书群，链式发送中断');
  const nextPayload = await cfg.build(step.runId, run.feishuChatId, nextIndex, evidence.dedupKeyBase);
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['dispatched', 'done'] } },
    data: {
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.FEISHU_SEND_MESSAGE, payload: nextPayload }),
      idempotencyKey: `${step.runId}:${step.code}:${randomBytes(6).toString('hex')}`,
    },
  });
  if (updated.count === 0) throw new EngineError(409, `${step.code} 链式下发冲突：指令状态已变化，请人工检查`);
}

/** 发送失败的回退通道：禁止自动重发，人工在群内发送后在此登记 */
export async function markRound1ManualSend(
  userId: string,
  runId: string,
  input: { confirm?: { filesSent?: boolean; textSent?: boolean }; note?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const allowed = [RUN_STATE.AWAITING_SEND_APPROVAL_ROUND1_DOCS, 'failed'];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能登记人工发送`);
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S9' } });
  const c = { filesSent: input.confirm?.filesSent === true, textSent: input.confirm?.textSent === true };
  if (!c.filesSent || !c.textSent) throw new EngineError(409, '请先勾选确认两份文件与固定文案均已人工发送');

  const evidence = safeParse(step.evidence);
  const base = (evidence.dedupKeyBase as string | undefined) ?? `g1:manual:${run.feishuChatId ?? 'unknown'}:${Date.now()}`;
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        commandStatus: 'done',
        finishedAt: new Date(),
        failureReason: null,
        evidence: JSON.stringify({
          ...evidence,
          manualSend: { by: userId, at: new Date().toISOString(), note: input.note?.slice(0, 300) ?? null, dedupKeyBase: base },
        }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status !== RUN_STATE.ROUND1_DOCS_SENT) {
      await transitionRun(tx, fresh, RUN_STATE.ROUND1_DOCS_SENT, 'S9 人工发送登记');
    }
    const afterSend = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (afterSend.status === RUN_STATE.ROUND1_DOCS_SENT) {
      await transitionRun(tx, afterSend, RUN_STATE.WAITING_ROUND1_REVIEW_REPLY, 'S9 人工发送登记完成，等待导师回复');
    }
    for (let i = 0; i < 3; i += 1) {
      const key = `${base}#${i}`;
      const existing = await tx.contentOpsFeishuMessage.findUnique({ where: { dedupKey: key } });
      if (existing) {
        await tx.contentOpsFeishuMessage.update({ where: { dedupKey: key }, data: { status: 'sent', createdBy: 'human', sentAt: new Date() } });
      } else {
        await tx.contentOpsFeishuMessage.create({
          data: {
            runId,
            dedupKey: key,
            chatId: run.feishuChatId ?? 'unknown',
            direction: 'outbound',
            templateId: i === 2 ? 'g1_round1_docs_text' : null,
            status: 'sent',
            createdBy: 'human',
            sentAt: new Date(),
          },
        });
      }
    }
  });
  await audit(userId, 'content_ops.mark_round1_manual_send', runId, { note: input.note?.slice(0, 300) ?? null });
  return { ok: true };
}

// ------------------------------------------------------------------
// S10 / S11：第一轮审核清单回复接收归档 + Codex 吸收（P2b）
// 规范：D:\database\AGENTS.md §10 —— 只认导师在已确认群上传、文件名含
// 「第一轮审核清单」的文件；归档命名 `_回复`；不得改写导师回复。
// ------------------------------------------------------------------

/** S10 扫描群回复（元数据级）：候选落 evidence.replyScan，等人工勾选 */
export async function startRound1ReplyScan(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const allowed: string[] = [
    RUN_STATE.ROUND1_DOCS_SENT,
    RUN_STATE.WAITING_ROUND1_REVIEW_REPLY,
    RUN_STATE.ROUND1_REPLY_RECEIVED,
  ];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描第一轮回复`);
  }
  if (!run.feishuChatId) throw new EngineError(409, 'Run 未绑定飞书群，无法扫描群消息');
  await ensureStepRows(runId, ['S10', 'S11']);
  if (run.status === RUN_STATE.ROUND1_DOCS_SENT) {
    await transitionRun(prisma, run, RUN_STATE.WAITING_ROUND1_REVIEW_REPLY, 'S10 回复扫描发起');
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S10' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.FEISHU_LIST_MESSAGES,
        payload: { chatId: run.feishuChatId, limit: 200, order: 'desc' },
      }),
      idempotencyKey: `${runId}:S10:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S10 已有指令在执行中，请等待完成或失败后再试');
  await audit(userId, 'content_ops.start_round1_reply_scan', runId, { chatId: run.feishuChatId });
  return { queued: true };
}

async function handleFeishuListMessagesResult(
  step: { id: string; evidence: string | null },
  result: Record<string, unknown>,
  round: ReplyRound = 1,
) {
  const raw = Array.isArray(result.messages) ? result.messages : [];
  const metas: ReplyMessageMeta[] = raw.map((m) => {
    const r = (m ?? {}) as Record<string, unknown>;
    return {
      messageId: typeof r.messageId === 'string' ? r.messageId : '',
      msgType: typeof r.msgType === 'string' ? r.msgType : '',
      createTime: Number.isFinite(Number(r.createTime)) ? Number(r.createTime) : null,
      senderName: typeof r.senderName === 'string' ? r.senderName : null,
      senderType: typeof r.senderType === 'string' ? r.senderType : null,
      deleted: r.deleted === true,
      fileName: typeof r.fileName === 'string' ? r.fileName : null,
      fileKey: typeof r.fileKey === 'string' ? r.fileKey : null,
    };
  });
  const view = filterReplyCandidates(metas, round);
  const scanKey = round === 2 ? 'replyScanRound2' : 'replyScan';
  // 只记候选不改主线状态：等人工勾选归档（与 S1 扫描同构）
  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({ count: raw.length, candidateCount: view.candidates.length, round }),
      status: STEP_STATUS.WAITING_HUMAN,
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        [scanKey]: { ...view, scannedAt: new Date().toISOString() },
      }),
    },
  });
}

/** S10 勾选归档：校验所选消息在扫描候选内，下发下载指令（`_回复` 命名在引擎计算）；
 * 手工兜底：导师以文字回复或文件不规范时，人工把文件放入导师目录后按相对路径登记哈希 */
export async function submitRound1Reply(
  userId: string,
  runId: string,
  input: { messageId?: string; manualRelPath?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [
    RUN_STATE.WAITING_ROUND1_REVIEW_REPLY,
    RUN_STATE.ROUND1_REPLY_RECEIVED,
  ];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能归档第一轮回复`);
  }
  await ensureStepRows(runId, ['S10', 'S11']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S10' } });
  const evidence = safeParse(step.evidence);
  const mentorPrefix = `mentors/${run.mentorDir}/`;

  // —— 手工兜底路径：登记已在导师目录内的人工放置文件 ——
  if (input.manualRelPath) {
    const rel = input.manualRelPath.trim().replace(/\\/g, '/');
    if (!rel.startsWith(mentorPrefix) || rel.includes('..') || rel === mentorPrefix) {
      throw new EngineError(409, `手工登记路径必须在导师目录内（${mentorPrefix}<文件名>）`);
    }
    if (!/\.(md|txt|docx?|pdf)$/i.test(rel)) {
      throw new EngineError(409, '手工登记仅支持文档类文件（md/txt/doc/docx/pdf），S10 不收音频');
    }
    const fileName = rel.slice(mentorPrefix.length).split('/').pop() ?? '';
    const updated = await prisma.contentOpsStep.updateMany({
      where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
      data: {
        status: STEP_STATUS.RUNNING,
        commandStatus: 'queued',
        commandPayload: JSON.stringify({
          type: COMMAND.HASH_FILES,
          payload: {
            items: [{ path: `${contentRoot}\\${rel.replace(/\//g, '\\')}` }],
            files: [{ relPath: rel, kind: 'round1_reply', sourceType: 'primary', note: 'S10 手工登记兜底' }],
          },
        }),
        idempotencyKey: `${runId}:S10:${randomBytes(6).toString('hex')}`,
        failureReason: null,
      },
    });
    if (updated.count === 0) throw new EngineError(409, 'S10 已有指令在执行中，请等待完成或失败后再试');
    await prisma.contentOpsStep.update({
      where: { id: step.id },
      data: {
        evidence: JSON.stringify({
          ...evidence,
          replySelection: {
            fileName,
            senderName: '人工登记',
            messageId: null,
            createTime: null,
            destName: fileName,
            selectedBy: userId,
            selectedAt: new Date().toISOString(),
          },
        }),
      },
    });
    await audit(userId, 'content_ops.submit_round1_reply_manual', runId, { relPath: rel });
    return { queued: true, destName: fileName };
  }

  // —— 扫描勾选路径 ——
  const scan = evidence.replyScan as { candidates?: ReplyCandidate[] } | undefined;
  const candidate = scan?.candidates?.find((c) => c.messageId === input.messageId);
  if (!candidate || !candidate.fileKey) {
    throw new EngineError(409, '所选消息不在已扫描候选中（或缺少文件标识），请重新扫描后选择');
  }
  const destName = buildReplyFileName(candidate.fileName);
  const destDirAbs = `${contentRoot}\\mentors\\${run.mentorDir}`;
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.FEISHU_DOWNLOAD_RESOURCE,
        payload: { messageId: candidate.messageId, fileKey: candidate.fileKey, type: 'file', destDirAbs, destName },
      }),
      idempotencyKey: `${runId}:S10:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S10 已有指令在执行中，请等待完成或失败后再试');
  // 选择上下文入证据，下载结果回填 sha256/bytes 后合成 archivedReply
  const replySelection = {
    messageId: candidate.messageId,
    fileName: candidate.fileName,
    senderName: candidate.senderName,
    createTime: candidate.createTime,
    destName,
    selectedBy: userId,
    selectedAt: new Date().toISOString(),
  };
  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: { evidence: JSON.stringify({ ...evidence, replySelection }) },
  });
  await audit(userId, 'content_ops.submit_round1_reply', runId, { messageId: candidate.messageId, destName });
  return { queued: true, destName };
}

async function handleFeishuDownloadReplyResult(
  step: { id: string; runId: string; code: string; evidence: string | null; run: { id: string; status: string } },
  result: Record<string, unknown>,
  round: ReplyRound = 1,
) {
  const selKey = round === 2 ? 'replySelectionRound2' : 'replySelection';
  const archivedKey = round === 2 ? 'archivedReplyRound2' : 'archivedReply';
  const targetState = round === 2 ? RUN_STATE.ROUND2_REPLY_RECEIVED : RUN_STATE.ROUND1_REPLY_RECEIVED;
  const sel = (safeParse(step.evidence) as Record<string, unknown>)[selKey] as Record<string, unknown> | undefined;
  const archived = {
    round,
    fileName: (sel?.fileName as string | undefined) ?? null,
    destName: typeof result.destName === 'string' ? result.destName : ((sel?.destName as string | undefined) ?? null),
    senderName: (sel?.senderName as string | undefined) ?? null,
    messageId: (sel?.messageId as string | undefined) ?? null,
    createTime: (sel?.createTime as number | undefined) ?? null,
    bytes: Number.isFinite(Number(result.bytes)) ? Number(result.bytes) : 0,
    sha256: typeof result.sha256 === 'string' ? result.sha256 : null,
    archivedAt: new Date().toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: round === 2
        ? {
            // S16 = 归档 + Codex 最终吸收同一卡片：归档完成后保持等待人工，不结束步骤
            commandStatus: 'done',
            commandResult: JSON.stringify({ archived }),
            status: STEP_STATUS.WAITING_HUMAN,
            evidence: JSON.stringify({ ...safeParse(step.evidence), [archivedKey]: archived }),
          }
        : {
            status: STEP_STATUS.DONE,
            commandStatus: 'done',
            commandResult: JSON.stringify({ archived }),
            finishedAt: new Date(),
            evidence: JSON.stringify({ ...safeParse(step.evidence), [archivedKey]: archived }),
          },
    });
    const run = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
    if (run.status !== targetState) {
      await transitionRun(tx, run, targetState, `S${round === 2 ? '16' : '10'} ${round === 2 ? '第二轮' : '第一轮'}回复归档完成`);
    }
  });
}

/** S11 扫描导师 work 目录：版本包清单落 evidence.workPackages，等人工选择新包 */
export async function startAbsorbWorkScan(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  if (run.status !== RUN_STATE.ROUND1_REPLY_RECEIVED) {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描 work 目录`);
  }
  await ensureStepRows(runId, ['S11']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S11' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.SCAN_WORK_PACKAGES, payload: { mentorDir: run.mentorDir } }),
      idempotencyKey: `${runId}:S11:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S11 已有指令在执行中，请等待完成或失败后再试');
  await audit(userId, 'content_ops.start_absorb_work_scan', runId, { mentorDir: run.mentorDir });
  return { queued: true };
}

async function handleAbsorbScanResult(step: { id: string; runId: string; evidence: string | null }, result: Record<string, unknown>) {
  const raw = Array.isArray(result.packages) ? result.packages : [];
  const packages: AbsorbPackageMeta[] = raw
    .map((p) => {
      const r = (p ?? {}) as Record<string, unknown>;
      const stat = (r.startHereStat ?? {}) as { mtime?: string; size?: number };
      return {
        name: typeof r.name === 'string' ? r.name : '',
        mtime: typeof stat.mtime === 'string' ? stat.mtime : null,
        size: typeof stat.size === 'number' ? stat.size : undefined,
      };
    })
    .filter((p) => p.name)
    .slice(0, 100);

  // 识别本轮新包：排除 S7 已核验包、要求 mtime 晚于 S11 提交时刻、取最新（见 absorb.ts）
  const evidence = safeParse(step.evidence);
  const submittedAt = (evidence.codexSubmit as { at?: string } | undefined)?.at ?? null;
  const s7 = await prisma.contentOpsStep.findFirst({ where: { runId: step.runId, code: 'S7' } });
  const previousPackage = (safeParse(s7?.evidence ?? null).chosenPackage as string | undefined) ?? null;
  const pick = submittedAt
    ? pickAbsorbPackages({ packages, previousPackage, submittedAt })
    : { packages: packages.map((p) => ({ ...p, isPreviousRound: p.name === previousPackage, afterSubmit: false, recommended: false })), ready: false, recommended: null };

  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({ packageCount: packages.length, ready: pick.ready, recommended: pick.recommended }),
      status: STEP_STATUS.WAITING_HUMAN,
      evidence: JSON.stringify({
        ...evidence,
        workPackages: pick.packages,
        absorbReady: pick.ready,
        absorbRecommended: pick.recommended,
        scannedAt: new Date().toISOString(),
      }),
    },
  });
}

/**
 * S11 双动作（刻意比 S6 简：续轮动作固定，只留一个提交确认点）：
 * - 登记「已在 Codex 专属对话提交固定触发语」，
 *   可选登记 Codex 对话标识（落 run.taskContract.codexThreadId，S12/S14 复用同一对话）；
 *   登记时间即步骤开始时间（codexSubmit.at），不为复制动作单独留痕；
 * - Codex 完成后确认：必须先登记提交、再选中已扫描出的版本包，双证据收步。
 */
export async function confirmRound1Absorb(
  userId: string,
  runId: string,
  input: { submittedToConversation?: boolean; codexThreadId?: string; workPackage?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.ROUND1_REPLY_RECEIVED) {
    throw new EngineError(409, `当前状态（${run.status}）不能操作 Codex 吸收`);
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S11' } });
  const evidence = safeParse(step.evidence);

  if (input.submittedToConversation) {
    const threadId = input.codexThreadId?.trim().slice(0, 120) || null;
    await prisma.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.RUNNING,
        startedAt: step.startedAt ?? new Date(),
        evidence: JSON.stringify({
          ...evidence,
          codexSubmit: { by: userId, at: new Date().toISOString(), codexThreadId: threadId },
        }),
      },
    });
    if (threadId) {
      const contract = safeParse(run.taskContract);
      contract.codexThreadId = threadId;
      await prisma.contentOpsRun.update({
        where: { id: runId },
        data: { taskContract: JSON.stringify(contract) },
      });
    }
    await audit(userId, 'content_ops.register_round1_absorb_submit', runId, { hasThreadId: !!threadId });
    return { ok: true, registered: true };
  }

  // 完成确认
  const pkg = input.workPackage?.trim();
  if (!evidence.codexSubmit) {
    throw new EngineError(409, '请先确认已在 Codex 专属对话提交固定触发语');
  }
  if (!pkg) throw new EngineError(409, '请选择 Codex 产出的新版本包（先扫描 work 目录）');
  const workPackages = Array.isArray(evidence.workPackages)
    ? (evidence.workPackages as Array<{ name?: string }>).map((p) => p.name).filter((n): n is string => Boolean(n))
    : [];
  if (!workPackages.includes(pkg)) {
    throw new EngineError(409, `所选版本包 ${pkg} 不在已扫描列表中，请重新扫描后选择`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        commandStatus: 'done',
        finishedAt: new Date(),
        evidence: JSON.stringify({
          ...safeParse(step.evidence),
          absorbConfirm: { by: userId, at: new Date().toISOString(), workPackage: pkg },
        }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status !== RUN_STATE.CODEX_ROUND1_ABSORB) {
      await transitionRun(tx, fresh, RUN_STATE.CODEX_ROUND1_ABSORB, 'S11 Codex 吸收确认');
    }
  });
  await audit(userId, 'content_ops.confirm_round1_absorb', runId, { workPackage: pkg });
  return { ok: true };
}

async function finishStepAndAdvance(
  step: { id: string; runId: string; code: string; run: { id: string; status: string } },
  nextRunState: string,
  result: unknown,
  opts: { alsoDone?: string[] } = {},
) {
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        commandStatus: 'done',
        commandResult: JSON.stringify(result),
        finishedAt: new Date(),
      },
    });
    for (const code of opts.alsoDone ?? []) {
      await tx.contentOpsStep.updateMany({
        where: { runId: step.runId, code, status: { not: STEP_STATUS.DONE } },
        data: { status: STEP_STATUS.DONE, finishedAt: new Date() },
      });
    }
    const run = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
    // 同态不重复迁移（S1 在登记时已进入 round1_material_received；failed 恢复等场景）
    if (run.status !== nextRunState) {
      await transitionRun(tx, run, nextRunState, `step ${step.code} done`);
    }
  });
}

// ------------------------------------------------------------------
// 指令入队（业务动作触发）
// ------------------------------------------------------------------

async function enqueueHashFiles(
  runId: string,
  stepCode: string,
  files: Array<{ relPath: string; kind: string; sourceType: string; note?: string }>,
  contentRoot: string | null,
) {
  if (!contentRoot) throw new EngineError(409, 'Runner 尚未上报 CONTENT_ROOT，无法定位文件');
  // 统一为正斜杠相对路径，再由 Runner 侧校验越界
  // Claude 产物（claude_output）附带 by_sonnet 规范命名标记：Runner 哈希前自动重命名为 `… by sonnet.<ext>`
  const items = files.map((f) => ({
    path: `${contentRoot}\\${f.relPath.replace(/\//g, '\\')}`,
    ...(f.kind === 'claude_output' ? { normalize: 'by_sonnet' as const } : {}),
  }));
  // done 也允许再次入队：S1 扫描指令完成后接哈希登记、S5 等待 R3 期间补登记产物。
  // 同一步骤重发同类指令时轮换幂等键，否则 Runner processed.json 按「键+类型」去重会跳过新指令。
  const updated = await prisma.contentOpsStep.updateMany({
    where: { runId, code: stepCode, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.HASH_FILES, payload: { files, items } }),
      idempotencyKey: `${runId}:${stepCode}:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) {
    throw new EngineError(409, '该步骤已有指令在执行中，请等待当前哈希完成');
  }
}

async function latestOnlineRunner() {
  const runner = await prisma.contentOpsRunner.findFirst({
    where: { lastSeenAt: { gt: new Date(Date.now() - RUNNER_ONLINE_MS) } },
    orderBy: { lastSeenAt: 'desc' },
  });
  return runner ?? null;
}

// ------------------------------------------------------------------
// Runs：创建 / 查询
// ------------------------------------------------------------------

export async function createRun(userId: string, input: {
  mentorDir: string;
  feishuChatName: string;
  feishuChatId?: string;
  isPilot: boolean;
}) {
  const mentorDir = input.mentorDir.trim();
  const chatName = input.feishuChatName.trim();
  if (!mentorDir || mentorDir.length > 100) throw new EngineError(400, '导师目录名非法');
  if (!chatName || chatName.length > 100) throw new EngineError(400, '飞书群名称必须唯一确认');
  const dirStatus = mentorDirStatus(mentorDir);
  if (dirStatus !== 'ok') {
    throw new EngineError(400, `导师目录不可用（${dirStatus}）：${mentorDir}`);
  }
  const key = normalizeMentorDirKey(mentorDir);
  const dup = await prisma.contentOpsRun.findFirst({
    where: { mentorDirKey: key, status: { notIn: ['completed', 'cancelled'] } },
  });
  if (dup) throw new EngineError(409, `该导师已有未结束的 Run（${dup.status}），禁止重复创建`);

  const runner = await latestOnlineRunner();
  const online = !!runner;
  const initialStatus = online ? RUN_STATE.WAITING_ROUND1_SUBMISSION : RUN_STATE.WAITING_RUNNER;
  const heartbeat = runner?.lastHeartbeat ? safeParse(runner.lastHeartbeat) : {};
  const contentRoot = (heartbeat.contentRoot as string) || null;

  const run = await prisma.$transaction(async (tx) => {
    const r = await tx.contentOpsRun.create({
      data: {
        mentorDir,
        mentorDirKey: key,
        isPilot: input.isPilot,
        status: initialStatus,
        currentOwner: online ? ACTOR.HUMAN : ACTOR.CONTROL_PLANE,
        feishuChatName: chatName,
        feishuChatId: input.feishuChatId?.trim() || null,
        runnerId: runner?.id ?? null,
        taskContract: JSON.stringify({
          version: 1,
          rules: ['R1 不代做 Claude/Codex 内容', 'R2 只检查与装配', 'R3 人工最终判定'],
          r1Trigger: triggerFor(mentorDir),
        }),
        startedAt: new Date(),
      },
    });
    for (const def of STEP_DEFS.filter((d) => ACTIVE_CODES.includes(d.code))) {
      const isS0 = def.code === 'S0';
      await tx.contentOpsStep.create({
        data: {
          runId: r.id,
          code: def.code,
          round: 0,
          actor: def.actor,
          title: def.title,
          status: isS0 ? STEP_STATUS.DONE : STEP_STATUS.PENDING,
          idempotencyKey: `${r.id}:${def.code}:0`,
          startedAt: isS0 ? new Date() : null,
          finishedAt: isS0 ? new Date() : null,
          evidence: isS0
            ? JSON.stringify({
                feishuChatName: chatName,
                env: { runnerOnline: online, contentRoot },
              })
            : null,
        },
      });
    }
    return r;
  });

  await appendEvent({
    runId: run.id,
    agent: 'control_plane',
    type: 'stage',
    payload: { stage: 'run_created', mentorDir, isPilot: input.isPilot, runnerOnline: online },
  });

  // S0 附带机器人进群探测（软提示，不改变 S0 业务状态；未填群 ID 则跳过）。
  // 结果落 S0 evidence.botCheck：bots 名单供详情页显示「榨职机助手」是否在群。
  if (run.feishuChatId) {
    await prisma.contentOpsStep.updateMany({
      where: { runId: run.id, code: 'S0', commandStatus: 'none' },
      data: {
        commandStatus: 'queued',
        commandPayload: JSON.stringify({
          type: COMMAND.FEISHU_CHAT_INFO,
          payload: { chatId: run.feishuChatId },
        }),
      },
    });
  }
  await audit(userId, 'content_ops.run_create', run.id, {
    mentorDir,
    feishuChatName: chatName,
    runnerOnline: online,
    isPilot: input.isPilot,
  });
  return run;
}

export async function listRuns() {
  const runs = await prisma.contentOpsRun.findMany({
    orderBy: { createdAt: 'desc' },
    include: { runner: { select: { name: true, lastSeenAt: true, status: true } } },
  });
  return runs.map(serializeRunListItem);
}

function serializeRunListItem(r: {
  id: string;
  mentorDir: string;
  isPilot: boolean;
  status: string;
  currentOwner: string;
  feishuChatName: string | null;
  createdAt: Date;
  startedAt: Date | null;
  runner: { name: string; lastSeenAt: Date | null; status: string } | null;
}) {
  return {
    id: r.id,
    mentorDir: r.mentorDir,
    isPilot: r.isPilot,
    status: r.status,
    currentOwner: r.currentOwner,
    feishuChatName: r.feishuChatName,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    runner: r.runner
      ? { name: r.runner.name, status: r.runner.status, lastSeenAt: r.runner.lastSeenAt?.toISOString() ?? null }
      : null,
  };
}

function parseHeartbeat(raw: string | null): {
  probes: VpnSnapshot | null;
  contentRoot: string | null;
} {
  if (!raw) return { probes: null, contentRoot: null };
  try {
    const j = JSON.parse(raw) as { probes?: VpnSnapshot; contentRoot?: string };
    return { probes: j.probes ?? null, contentRoot: j.contentRoot ?? null };
  } catch {
    return { probes: null, contentRoot: null };
  }
}

export async function getRunDetail(runId: string) {
  const run = await prisma.contentOpsRun.findUnique({
    where: { id: runId },
    include: {
      steps: { orderBy: [{ round: 'asc' }, { id: 'asc' }] },
      artifacts: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 30 },
      approvals: { orderBy: { createdAt: 'desc' } },
      runner: true,
    },
  });
  if (!run) throw new EngineError(404, 'Run 不存在');

  const online = !!run.runner && (run.runner.lastSeenAt?.getTime() ?? 0) > Date.now() - RUNNER_ONLINE_MS;
  const { probes, contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  const nextDef = nextActiveStep(run.steps.map((s) => ({ code: s.code, status: s.status })));
  const vpnHint = evaluateVpnHint(nextDef, online, probes);

  return {
    id: run.id,
    mentorDir: run.mentorDir,
    isPilot: run.isPilot,
    status: run.status,
    currentOwner: run.currentOwner,
    feishuChatName: run.feishuChatName,
    feishuChatId: run.feishuChatId,
    lockedMainSha: run.lockedMainSha,
    taskContract: safeParse(run.taskContract),
    contentRoot,
    runner: run.runner
      ? {
          id: run.runner.id,
          name: run.runner.name,
          version: run.runner.version,
          online,
          lastSeenAt: run.runner.lastSeenAt?.toISOString() ?? null,
        }
      : null,
    vpn: { hint: vpnHint, raw: online ? probes : null },
    steps: run.steps.map((s) => ({
      id: s.id,
      code: s.code,
      round: s.round,
      title: s.title,
      actor: s.actor,
      status: s.status,
      commandStatus: s.commandStatus,
      failureReason: s.failureReason,
      evidence: safeParse(s.evidence),
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
    })),
    artifacts: run.artifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      displayPath: a.displayPath,
      sha256: a.sha256,
      bytes: a.bytes.toString(),
      version: a.version,
      sourceType: a.sourceType,
      validationStatus: a.validationStatus,
      approvalStatus: a.approvalStatus,
      immutable: a.immutable,
      createdAt: a.createdAt.toISOString(),
    })),
    events: run.events.map((e) => ({
      id: e.id,
      agent: e.agent,
      type: e.type,
      payload: safeParse(e.payload),
      createdAt: e.createdAt.toISOString(),
    })),
    approvals: run.approvals.map((a) => ({
      id: a.id,
      gate: a.gate,
      stepCode: a.stepCode,
      buttonName: a.buttonName,
      status: a.status,
      actorId: a.actorId,
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: run.createdAt.toISOString(),
  };
}

function nextActiveStep(steps: Array<{ code: string; status: string }>) {
  const ordered = STEP_DEFS.filter((d) => ACTIVE_CODES.includes(d.code)).map((d) => {
    const s = steps.find((x) => x.code === d.code);
    return { def: d, status: s?.status ?? 'pending' };
  });
  const next = ordered.find((x) => x.status !== STEP_STATUS.DONE && x.status !== STEP_STATUS.SKIPPED);
  return next ? next.def : null;
}

export async function listRunners() {
  const runners = await prisma.contentOpsRunner.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 5 });
  return runners.map((r) => {
    const online = (r.lastSeenAt?.getTime() ?? 0) > Date.now() - RUNNER_ONLINE_MS;
    const hb = parseHeartbeat(r.lastHeartbeat);
    const dirs = parseHeartbeatDirs(r.lastHeartbeat);
    return {
      id: r.id,
      name: r.name,
      version: r.version,
      online,
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      contentRoot: hb.contentRoot,
      probes: online ? hb.probes : null,
      dirs: online ? dirs : [],
    };
  });
}

function parseHeartbeatDirs(raw: string | null): Array<{ name: string; status: string }> {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as { dirs?: Array<{ name: string; status: string }> };
    return Array.isArray(j.dirs)
      ? j.dirs.map((d) => ({ name: String(d.name), status: String(d.status) }))
      : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// S1：Runner 扫描导师目录列候选文件（扫描+勾选确认的第一步）
// ------------------------------------------------------------------

export async function scanMentorFiles(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({
    where: { id: runId },
    include: { runner: true },
  });
  const allowedStates = [RUN_STATE.WAITING_ROUND1_SUBMISSION, RUN_STATE.ROUND1_MATERIAL_RECEIVED, 'failed'];
  if (!allowedStates.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描 S1 候选文件`);
  }
  const s1 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S1' } });
  if (s1.status === STEP_STATUS.DONE) throw new EngineError(409, 'S1 已完成，无需再扫描');
  if (s1.commandStatus === 'queued' || s1.commandStatus === 'dispatched') {
    throw new EngineError(409, '已有指令在执行中，请稍候');
  }
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');

  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: s1.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: s1.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.LIST_MENTOR_FILES,
        payload: { mentorDir: run.mentorDir },
      }),
      // 重新扫描是同类型新指令，轮换幂等键，绕过 Runner「键+类型」去重
      idempotencyKey: `${runId}:S1:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, '扫描指令入队失败（指令状态异常）');
  await audit(userId, 'content_ops.scan_mentor_files', runId, { mentorDir: run.mentorDir });
  return { queued: true };
}

export async function scanWorkFiles(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({
    where: { id: runId },
    include: { runner: true },
  });
  const allowedStates = [RUN_STATE.ROUND1_MATERIAL_RECEIVED, RUN_STATE.ROUND1_ARCHIVING, 'failed'];
  if (!allowedStates.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描 S2 归档产物`);
  }
  const s2 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S2' } });
  if (s2.status === STEP_STATUS.DONE) throw new EngineError(409, 'S2 已完成，无需再扫描');
  if (s2.commandStatus === 'queued' || s2.commandStatus === 'dispatched') {
    throw new EngineError(409, '已有指令在执行中，请稍候');
  }
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');

  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: s2.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: s2.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.LIST_WORK_FILES,
        payload: { mentorDir: run.mentorDir },
      }),
      idempotencyKey: `${runId}:S2:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, '扫描指令入队失败（指令状态异常）');
  await audit(userId, 'content_ops.scan_work_files', runId, { mentorDir: run.mentorDir });
  return { queued: true };
}

export async function scanClaudeOutputs(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({
    where: { id: runId },
    include: { runner: true },
  });
  if (run.status !== RUN_STATE.CLAUDE_MANUAL_STEP && run.status !== 'failed') {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描 Claude 产物`);
  }
  const s5 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S5' } });
  if (s5.status === STEP_STATUS.DONE) throw new EngineError(409, 'S5 已完成，无需再扫描');
  if (s5.commandStatus === 'queued' || s5.commandStatus === 'dispatched') {
    throw new EngineError(409, '已有指令在执行中，请稍候');
  }
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');

  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: s5.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      // 不动步骤状态：S5 可能已是 waiting_human（等 R3），扫描只是刷新候选清单
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.PREPARE_CLAUDE_OUTPUTS,
        payload: { mentorDir: run.mentorDir },
      }),
      idempotencyKey: `${runId}:S5:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, '扫描指令入队失败（指令状态异常）');
  await audit(userId, 'content_ops.scan_claude_outputs', runId, { mentorDir: run.mentorDir });
  return { queued: true };
}

// ------------------------------------------------------------------
// S1/S2/S5：人工完成本地动作后，提交文件清单给 Runner 哈希登记
// ------------------------------------------------------------------

const OBSERVE_RULES: Record<string, { runStates: string[]; kinds: string[]; sourceType: string }> = {
  S1: {
    runStates: [RUN_STATE.WAITING_ROUND1_SUBMISSION, RUN_STATE.ROUND1_MATERIAL_RECEIVED, 'failed'],
    kinds: ['source_audio', 'source_transcript'],
    sourceType: 'primary',
  },
  S2: {
    runStates: [RUN_STATE.ROUND1_MATERIAL_RECEIVED, RUN_STATE.ROUND1_ARCHIVING, 'failed'],
    kinds: ['merged_audio', 'normalized_md'],
    sourceType: 'generated',
  },
  S5: {
    runStates: [RUN_STATE.CLAUDE_MANUAL_STEP, 'failed'],
    kinds: ['claude_output'],
    sourceType: 'secondary',
  },
  // S13 二轮材料归档完成后补登归并产物（full interview/full transcript），与 S2 同构但不推进状态
  S13: {
    runStates: [RUN_STATE.ROUND2_MATERIAL_RECEIVED, RUN_STATE.CODEX_ROUND2_UPDATE, RUN_STATE.ROUND2_DOCS_QC, RUN_STATE.ROUND2_DOCS_QC_FAILED, 'failed'],
    kinds: ['merged_audio', 'normalized_md'],
    sourceType: 'generated',
  },
};

export async function observeFiles(
  userId: string,
  runId: string,
  input: { step: string; files: Array<{ relPath: string; kind: string; note?: string }> },
) {
  const rule = OBSERVE_RULES[input.step];
  if (!rule) throw new EngineError(400, `P1 不支持对 ${input.step} 登记文件`);
  if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > 50) {
    throw new EngineError(400, '文件清单非法（1-50 个）');
  }
  const files = input.files.map((f) => ({
    relPath: String(f.relPath || '').replace(/\\/g, '/'),
    kind: String(f.kind || ''),
    sourceType: rule.sourceType,
    note: f.note ? String(f.note).slice(0, 500) : undefined,
  }));
  if (files.some((f) => !f.relPath.includes('/') || !rule.kinds.includes(f.kind))) {
    throw new EngineError(400, '文件路径或类型不合法');
  }

  const run = await prisma.contentOpsRun.findUniqueOrThrow({
    where: { id: runId },
    include: { runner: true },
  });
  if (!rule.runStates.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能登记 ${input.step} 文件`);
  }
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');

  if (input.step === 'S1' && run.status === RUN_STATE.WAITING_ROUND1_SUBMISSION) {
    await prisma.contentOpsRun.update({
      where: { id: runId },
      data: { status: RUN_STATE.ROUND1_MATERIAL_RECEIVED, currentOwner: ACTOR.RUNNER },
    });
    await appendEvent({ runId, agent: 'human', type: 'stage', payload: { to: 'round1_material_received' } });
  }

  await enqueueHashFiles(runId, input.step, files, contentRoot);
  await audit(userId, 'content_ops.observe_files', runId, { step: input.step, files: files.map((f) => ({ path: f.relPath, kind: f.kind })) });
  return { queued: true };
}

// ------------------------------------------------------------------
// S4：Claude 人工摹写登记（manual_only）
// ------------------------------------------------------------------

export async function manualNote(
  userId: string,
  runId: string,
  input: { phase: 'started' | 'completed'; conversationName?: string; note?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.CLAUDE_MANUAL_STEP && run.status !== 'failed') {
    throw new EngineError(409, `当前状态（${run.status}）不能登记 Claude 动作`);
  }
  const s4 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S4' } });
  const evidence = { ...safeParse(s4.evidence) };
  if (input.phase === 'started') {
    if (!input.conversationName?.trim()) throw new EngineError(400, '请填写导师风格摹写对话名');
    Object.assign(evidence, {
      conversationName: input.conversationName.trim(),
      startedBy: userId,
      startedAt: evidence.startedAt ?? new Date().toISOString(),
      note: input.note?.slice(0, 500) ?? evidence.note ?? null,
    });
    await prisma.contentOpsStep.update({
      where: { id: s4.id },
      data: { status: STEP_STATUS.RUNNING, startedAt: s4.startedAt ?? new Date(), evidence: JSON.stringify(evidence) },
    });
  } else {
    Object.assign(evidence, {
      completedBy: userId,
      completedAt: new Date().toISOString(),
    });
    await prisma.contentOpsStep.update({
      where: { id: s4.id },
      data: { status: STEP_STATUS.DONE, finishedAt: new Date(), evidence: JSON.stringify(evidence) },
    });
  }
  await audit(userId, 'content_ops.claude_manual_note', runId, { phase: input.phase });
  return { ok: true };
}

// ------------------------------------------------------------------
// S5：R3 勾选确认归档
// ------------------------------------------------------------------

export async function confirmArchive(
  userId: string,
  runId: string,
  input: { r3Checked: boolean; modelName?: string },
) {
  if (!input.r3Checked) throw new EngineError(400, '必须勾选 R3：产物由 Claude 在摹写对话生成、Trae 未代笔');
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.CLAUDE_MANUAL_STEP && run.status !== 'failed') {
    throw new EngineError(409, `当前状态（${run.status}）不能确认归档`);
  }
  const claudeArtifacts = await prisma.contentOpsArtifact.count({
    where: { runId, kind: 'claude_output', validationStatus: 'verified' },
  });
  if (claudeArtifacts === 0) throw new EngineError(409, '尚无已哈希登记的 Claude 产物，不能确认归档');
  const s5 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S5' } });

  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: s5.id },
      data: {
        status: STEP_STATUS.DONE,
        finishedAt: new Date(),
        evidence: JSON.stringify({
          ...safeParse(s5.evidence),
          r3CheckedBy: userId,
          r3CheckedAt: new Date().toISOString(),
          modelName: input.modelName?.slice(0, 80) ?? 'Sonnet 5.5 中等',
        }),
      },
    });
    // S6 附带 Codex CLI 探测（辅助，不改变 S6 业务状态）
    await tx.contentOpsStep.updateMany({
      where: { runId, code: 'S6', commandStatus: 'none' },
      data: {
        commandStatus: 'queued',
        commandPayload: JSON.stringify({ type: COMMAND.CODEX_PROBE, payload: {} }),
      },
    });
    await transitionRun(tx, run, RUN_STATE.CLAUDE_OUTPUT_ARCHIVED, 'R3 confirmed');
  });
  await audit(userId, 'content_ops.claude_archive_confirm', runId, { r3: true, claudeArtifacts });
  return { ok: true };
}

// ------------------------------------------------------------------
// S6：触发语复制登记 + 人工确认已在专属 Codex 对话提交
// ------------------------------------------------------------------

export async function codexSubmission(
  userId: string,
  runId: string,
  input: { action: 'copied' | 'started'; conversationName?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const s6 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S6' } });
  const contract = safeParse(run.taskContract) as { r1Trigger?: string };

  if (input.action === 'copied') {
    await audit(userId, 'content_ops.codex_trigger_copy', runId, {
      step: 'S6',
      triggerPreview: contract.r1Trigger ?? null,
    });
    return { ok: true, trigger: contract.r1Trigger ?? null };
  }

  if (!input.conversationName?.trim()) {
    throw new EngineError(400, '请确认该导师的专属 Codex 对话名（全程复用，不新建对话）');
  }
  if (run.status !== RUN_STATE.CLAUDE_OUTPUT_ARCHIVED && run.status !== RUN_STATE.CODEX_ROUND1_ASSEMBLY) {
    throw new EngineError(409, `当前状态（${run.status}）不能开始 Codex Assembly`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: s6.id },
      data: {
        status: STEP_STATUS.RUNNING,
        startedAt: s6.startedAt ?? new Date(),
        evidence: JSON.stringify({
          ...safeParse(s6.evidence),
          conversationName: input.conversationName!.trim(),
          startedBy: userId,
        }),
      },
    });
    if (run.status === RUN_STATE.CLAUDE_OUTPUT_ARCHIVED) {
      await transitionRun(tx, run, RUN_STATE.CODEX_ROUND1_ASSEMBLY, 'human confirmed codex started');
    }
  });
  await audit(userId, 'content_ops.codex_started', runId, { conversationName: input.conversationName.trim() });
  return { ok: true };
}

// ------------------------------------------------------------------
// S7：触发 Assembly 完成核验（扫描版本包 → 哈希 START_HERE）
// ------------------------------------------------------------------

export async function verifyAssembly(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  if (run.status !== RUN_STATE.CODEX_ROUND1_ASSEMBLY && run.status !== 'failed') {
    throw new EngineError(409, `当前状态（${run.status}）不能发起 Assembly 核验`);
  }
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  const s7 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S7' } });
  await prisma.contentOpsStep.update({
    where: { id: s7.id },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.SCAN_WORK_PACKAGES,
        payload: { mentorDir: run.mentorDir },
      }),
      // 轮换幂等键：固定键会让 Runner processed.json 把重试的 scan 当重复跳过
      idempotencyKey: `${runId}:S7:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  await audit(userId, 'content_ops.verify_assembly', runId, {});
  return { queued: true };
}

// ==================================================================
// P2c：S12-S16 第二轮全链路（AGENTS §11-§14）
// ==================================================================

/** 读取 S12 大纲实际送达群里的时刻（真实发送回执优先，其次人工补录时刻） */
async function getRound2OutlineSentAt(runId: string): Promise<string | null> {
  const s12 = await prisma.contentOpsStep.findFirst({ where: { runId, code: 'S12' } });
  if (!s12) return null;
  const ev = safeParse(s12.evidence) as {
    sendLog?: Array<{ at?: string }>;
    manualSend?: { at?: string };
  };
  return ev.sendLog?.[0]?.at ?? ev.manualSend?.at ?? null;
}

// ------------------------------------------------------------------
// S12：人工批准 + 发送第二轮官方大纲（G2，一条文本：文案+官方链接）
// ------------------------------------------------------------------

export async function approveSendRound2Outline(
  userId: string,
  runId: string,
  input: { confirm?: { chatConfirmed?: boolean; linkUnchanged?: boolean; copyUnchanged?: boolean } },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  if (run.status !== RUN_STATE.CODEX_ROUND1_ABSORB) {
    throw new EngineError(409, `当前状态（${run.status}）不能批准发送第二轮大纲`);
  }
  const s11 = await prisma.contentOpsStep.findFirst({ where: { runId, code: 'S11' } });
  if (s11?.status !== STEP_STATUS.DONE) throw new EngineError(409, 'S11 Codex 第一轮吸收尚未确认完成，不能发第二轮大纲');
  const c = {
    chatConfirmed: input.confirm?.chatConfirmed === true,
    linkUnchanged: input.confirm?.linkUnchanged === true,
    copyUnchanged: input.confirm?.copyUnchanged === true,
  };
  if (!Object.values(c).every(Boolean)) throw new EngineError(409, '证据核对勾未完成（三项须全部勾选）');
  await ensureStepRows(runId, ['S12']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  if (!run.feishuChatId) throw new EngineError(409, 'Run 未绑定飞书群，禁止发送');

  const dedupBase = `g2:${run.feishuChatId}:${sha256Text(G2_OUTLINE_LINK).slice(0, 12)}`;
  const dup = await prisma.contentOpsFeishuMessage.findFirst({
    where: { dedupKey: { startsWith: dedupBase }, status: 'sent' },
  });
  if (dup) throw new EngineError(409, '第二轮大纲已发送过，禁止重复发送');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S12' } });
  const payload = buildS12SendPayload(runId, run.feishuChatId, 0, dedupBase);
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.FEISHU_SEND_MESSAGE, payload }),
      idempotencyKey: `${runId}:S12:${randomBytes(6).toString('hex')}`,
      failureReason: null,
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        sendPlan: [{ kind: 'text', label: 'G2 第二轮大纲（固定文案+官方链接）' }],
        dedupKeyBase: dedupBase,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        sendLog: [],
      }),
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S12 已有发送指令在执行中');

  await prisma.contentOpsApproval.create({
    data: {
      runId,
      gate: 'G2',
      stepCode: 'S12',
      buttonName: '批准发送：第二轮官方大纲',
      scope: `仅本次向群 ${run.feishuChatName ?? run.feishuChatId} 发送 1 条 G2 大纲消息（官方共享链接，逐字不改）`,
      checks: JSON.stringify(c),
      status: 'approved',
      actorId: userId,
    },
  });
  await prisma.contentOpsFeishuMessage.create({
    data: {
      runId,
      dedupKey: `${dedupBase}#0`,
      chatId: run.feishuChatId,
      direction: 'outbound',
      templateId: 'g2_outline_text',
      status: 'pending',
      createdBy: 'runner',
    },
  });
  await audit(userId, 'content_ops.approve_send_round2_outline', runId, { gate: 'G2' });
  return { queued: true };
}

/** S12 人工补录（机器人未过审/发送失败回退） */
export async function markRound2OutlineManualSend(
  userId: string,
  runId: string,
  input: { confirm?: { sent?: boolean }; note?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const allowed = [RUN_STATE.CODEX_ROUND1_ABSORB, 'failed'];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能登记人工发送`);
  }
  if (input.confirm?.sent !== true) throw new EngineError(409, '请先勾选确认第二轮大纲消息已人工发送');
  await ensureStepRows(runId, ['S12']);
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S12' } });
  const evidence = safeParse(step.evidence);
  const base = (evidence.dedupKeyBase as string | undefined) ?? `g2:manual:${run.feishuChatId ?? 'unknown'}:${Date.now()}`;
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        commandStatus: 'done',
        finishedAt: new Date(),
        failureReason: null,
        evidence: JSON.stringify({
          ...evidence,
          dedupKeyBase: base,
          manualSend: { by: userId, at: new Date().toISOString(), note: input.note?.slice(0, 300) ?? null, dedupKeyBase: base },
        }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status !== RUN_STATE.ROUND2_OUTLINE_SENT) {
      await transitionRun(tx, fresh, RUN_STATE.ROUND2_OUTLINE_SENT, 'S12 人工发送登记');
    }
    const after = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (after.status === RUN_STATE.ROUND2_OUTLINE_SENT) {
      await transitionRun(tx, after, RUN_STATE.WAITING_ROUND2_SUBMISSION, 'S12 人工发送登记完成，等待第二轮材料');
    }
    const existing = await tx.contentOpsFeishuMessage.findUnique({ where: { dedupKey: `${base}#0` } });
    if (existing) {
      await tx.contentOpsFeishuMessage.update({
        where: { dedupKey: `${base}#0` },
        data: { status: 'sent', createdBy: 'human', sentAt: new Date() },
      });
    } else {
      await tx.contentOpsFeishuMessage.create({
        data: {
          runId,
          dedupKey: `${base}#0`,
          chatId: run.feishuChatId ?? 'unknown',
          direction: 'outbound',
          templateId: 'g2_outline_text',
          status: 'sent',
          createdBy: 'human',
          sentAt: new Date(),
        },
      });
    }
  });
  await audit(userId, 'content_ops.mark_round2_outline_manual_send', runId, {});
  return { ok: true };
}

// ------------------------------------------------------------------
// S13：第二轮访谈材料识别（事件分组）+ 归档到第二轮 audio/word 目录
// ------------------------------------------------------------------

export async function startRound2MaterialScan(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [
    RUN_STATE.ROUND2_OUTLINE_SENT,
    RUN_STATE.WAITING_ROUND2_SUBMISSION,
    RUN_STATE.ROUND2_MATERIAL_RECEIVED,
    'failed',
  ];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描第二轮材料`);
  }
  if (!run.feishuChatId) throw new EngineError(409, 'Run 未绑定飞书群，无法扫描群消息');
  await ensureStepRows(runId, ['S12', 'S13']);
  if (run.status === RUN_STATE.ROUND2_OUTLINE_SENT) {
    await transitionRun(prisma, run, RUN_STATE.WAITING_ROUND2_SUBMISSION, 'S13 材料扫描发起');
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S13' } });
  const sinceIso = await getRound2OutlineSentAt(runId);
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.FEISHU_LIST_MESSAGES,
        payload: { chatId: run.feishuChatId, limit: 300, order: 'desc' },
      }),
      idempotencyKey: `${runId}:S13:${randomBytes(6).toString('hex')}`,
      failureReason: null,
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        scanSince: sinceIso,
      }),
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S13 已有指令在执行中，请等待完成或失败后再试');
  await audit(userId, 'content_ops.start_round2_material_scan', runId, { sinceIso });
  return { queued: true, sinceIso };
}

/**
 * 收集本 Run 在 S1/S2/S10 已归档/归并过的文件名（**去掉扩展名后**的小写集合），供 S13 扫描时排除。
 * 用户实测：第二轮群消息中音频文件名和第一轮文字稿扩展名不同（.m4a vs .txt/.md），
 * 但去掉扩展名后的 base 相同；必须按 base 比对才能识别已归档/归并过的重复文件。
 *
 * 来源三处：
 * 1. artifact 行（S1/S2 登记、S10 手工 HASH_FILES）的 path 与 displayPath；
 * 2. S1/S2/S10 的 HASH_FILES 指令 payload——归并/重命名前的原始相对路径；
 * 3. S10 下载归档的 evidence.archivedReply（原始名+落盘名）。
 */
async function collectArchivedFileNames(runId: string): Promise<Set<string>> {
  const names = new Set<string>();
  const baseNoExt = (p: string | null | undefined) => {
    if (!p) return null;
    const seg = p.split(/[\\/]/).pop()?.trim();
    if (!seg) return null;
    const lower = seg.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot > 0 ? lower.slice(0, dot) : lower;
  };
  const artifacts = await prisma.contentOpsArtifact.findMany({
    where: { runId },
    select: { path: true, displayPath: true, provenance: true },
  });
  for (const a of artifacts) {
    const prov = safeParse(a.provenance);
    const by = typeof prov.registeredByStep === 'string' ? prov.registeredByStep : '';
    if (!['S1', 'S2', 'S10'].includes(by)) continue;
    for (const n of [baseNoExt(a.path), baseNoExt(a.displayPath)]) {
      if (n) names.add(n);
    }
  }
  const priorSteps = await prisma.contentOpsStep.findMany({
    where: { runId, code: { in: ['S1', 'S2', 'S10'] } },
    select: { code: true, commandPayload: true, evidence: true },
  });
  for (const s of priorSteps) {
    const payload = safeParse(s.commandPayload) as { payload?: { files?: Array<{ relPath?: string }> } };
    for (const f of payload.payload?.files ?? []) {
      const n = baseNoExt(typeof f?.relPath === 'string' ? f.relPath : null);
      if (n) names.add(n);
    }
    if (s.code === 'S10') {
      const archived = safeParse(s.evidence).archivedReply as { fileName?: string; destName?: string } | undefined;
      for (const n of [baseNoExt(archived?.fileName), baseNoExt(archived?.destName)]) {
        if (n) names.add(n);
      }
    }
  }
  return names;
}

async function handleRound2MaterialScanResult(
  step: { id: string; runId: string; evidence: string | null },
  result: Record<string, unknown>,
) {
  const raw = Array.isArray(result.messages) ? result.messages : [];
  const metas: ReplyMessageMeta[] = raw.map((m) => {
    const r = (m ?? {}) as Record<string, unknown>;
    return {
      messageId: typeof r.messageId === 'string' ? r.messageId : '',
      msgType: typeof r.msgType === 'string' ? r.msgType : '',
      createTime: Number.isFinite(Number(r.createTime)) ? Number(r.createTime) : null,
      senderName: typeof r.senderName === 'string' ? r.senderName : null,
      senderType: typeof r.senderType === 'string' ? r.senderType : null,
      deleted: r.deleted === true,
      fileName: typeof r.fileName === 'string' ? r.fileName : null,
      fileKey: typeof r.fileKey === 'string' ? r.fileKey : null,
    };
  });
  const evidence = safeParse(step.evidence);
  const sinceIso = typeof evidence.scanSince === 'string' ? evidence.scanSince : null;
  const sinceMs = sinceIso ? Date.parse(sinceIso) : null;
  const archivedNames = await collectArchivedFileNames(step.runId);
  const view = groupRound2Materials(metas, Number.isFinite(sinceMs) ? sinceMs : null, archivedNames);
  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({
        count: raw.length,
        groupCount: view.groups.length,
        suggestedGroupId: view.suggestedGroupId,
      }),
      status: STEP_STATUS.WAITING_HUMAN,
      evidence: JSON.stringify({
        ...evidence,
        materialScan: { ...view, scannedAt: new Date().toISOString() },
      }),
    },
  });
}

/** 飞书原始文件名可能含 Windows 非法字符：落盘名替换为全角等价符，原名保留在 provenance/displayName */
const ILLEGAL_FS_CHARS: Record<string, string> = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' };
export function sanitizeFileNameForFs(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, (ch) => ILLEGAL_FS_CHARS[ch] ?? '_');
}

/** S13 勾选归档 / 手工目录兜底：多文件链式下载，全部落盘哈希后才推进 */
export async function submitRound2Material(
  userId: string,
  runId: string,
  input: { messageIds?: string[]; manualFiles?: string[] },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.WAITING_ROUND2_SUBMISSION, RUN_STATE.ROUND2_MATERIAL_RECEIVED, 'failed'];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能归档第二轮材料`);
  }
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  await ensureStepRows(runId, ['S13']);
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S13' } });
  const evidence = safeParse(step.evidence);

  // —— 手工兜底：材料已由人工放入第二轮目录，按相对路径哈希登记 ——
  if (Array.isArray(input.manualFiles) && input.manualFiles.length > 0) {
    const mentorPrefix = `mentors/${run.mentorDir}/`;
    const files = input.manualFiles.map((p) => {
      const rel = String(p ?? '').trim().replace(/\\/g, '/');
      if (!rel.startsWith(mentorPrefix) || rel.includes('..') || !rel.includes('第二轮 interview')) {
        throw new EngineError(409, `手工登记路径必须在导师第二轮 interview 目录内：${p}`);
      }
      const fileName = rel.split('/').pop() ?? '';
      const isAudio = /\.(m4a|mp3|wav|aac|flac|ogg|opus|amr|wma|aiff|aif)$/i.test(fileName);
      const isDoc = /\.(md|txt|docx?|pdf)$/i.test(fileName);
      if (!isAudio && !isDoc) throw new EngineError(409, `第二轮材料只收音频/文稿文件：${fileName}`);
      return {
        relPath: rel,
        kind: isAudio ? 'source_audio' : 'source_transcript',
        sourceType: 'primary' as const,
        note: 'S13 手工登记兜底（第二轮）',
      };
    });
    if (files.length === 0 || files.length > 100) throw new EngineError(409, '手工登记文件数量非法（1-100）');
    const updated = await prisma.contentOpsStep.updateMany({
      where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
      data: {
        status: STEP_STATUS.RUNNING,
        commandStatus: 'queued',
        commandPayload: JSON.stringify({
          type: COMMAND.HASH_FILES,
          payload: {
            items: files.map((f) => ({ path: `${contentRoot}\\${f.relPath.replace(/\//g, '\\')}` })),
            files,
          },
        }),
        idempotencyKey: `${runId}:S13:${randomBytes(6).toString('hex')}`,
        failureReason: null,
        evidence: JSON.stringify({
          ...evidence,
          materialSelection: { manual: true, files: files.map((f) => f.relPath), selectedBy: userId, selectedAt: new Date().toISOString() },
        }),
      },
    });
    if (updated.count === 0) throw new EngineError(409, 'S13 已有指令在执行中，请等待完成或失败后再试');
    await audit(userId, 'content_ops.submit_round2_material_manual', runId, { count: files.length });
    return { queued: true, mode: 'manual', count: files.length };
  }

  // —— 扫描勾选：校验所选消息全部在分组扫描结果内 ——
  const ids = Array.isArray(input.messageIds) ? input.messageIds : [];
  if (ids.length === 0) throw new EngineError(409, '请勾选第二轮提交事件中的文件（或使用手工目录登记）');
  const scan = evidence.materialScan as
    | { groups?: Array<{ files: MaterialFile[] }> }
    | undefined;
  const allScanned: MaterialFile[] = (scan?.groups ?? []).flatMap((g) => g.files);
  const byId = new Map(allScanned.map((f) => [f.messageId, f]));
  const queue = ids.map((id) => {
    const f = byId.get(id);
    if (!f || !f.fileKey) throw new EngineError(409, `所选消息不在已扫描结果中（或缺少文件标识）：${id}`);
    const slot = f.kind === 'audio' ? 'audio' : 'word';
    return {
      messageId: f.messageId,
      fileKey: f.fileKey,
      fileName: f.fileName,
      destName: sanitizeFileNameForFs(f.fileName),
      kind: f.kind,
      senderName: f.senderName,
      createTime: f.createTime,
      slot,
    };
  });
  if (!queue.some((q) => q.slot === 'audio')) {
    throw new EngineError(409, '所选文件中没有音频：第二轮材料必须至少包含一个访谈录音，请核对事件分组');
  }

  const first = queue[0];
  const destDirAbs = round2DestDir(contentRoot, run.mentorDir, first.slot as 'audio' | 'word');
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.FEISHU_DOWNLOAD_RESOURCE,
        payload: {
          messageId: first.messageId,
          fileKey: first.fileKey,
          type: 'file',
          destDirAbs,
          destName: first.destName,
        },
      }),
      idempotencyKey: `${runId}:S13:${randomBytes(6).toString('hex')}`,
      failureReason: null,
      evidence: JSON.stringify({
        ...evidence,
        materialQueue: queue,
        materialArchived: [],
        materialSelection: { ids, selectedBy: userId, selectedAt: new Date().toISOString() },
      }),
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S13 已有指令在执行中，请等待完成或失败后再试');
  await audit(userId, 'content_ops.submit_round2_material', runId, { count: queue.length, audio: queue.filter((q) => q.slot === 'audio').length });
  return { queued: true, mode: 'download', count: queue.length };
}

async function handleRound2MaterialDownloadResult(
  step: { id: string; runId: string; code: string; evidence: string | null; run: { id: string; status: string; mentorDir: string } },
  result: Record<string, unknown>,
) {
  const evidence = safeParse(step.evidence);
  const queue = Array.isArray(evidence.materialQueue) ? (evidence.materialQueue as Array<Record<string, unknown>>) : [];
  const archived = Array.isArray(evidence.materialArchived) ? (evidence.materialArchived as unknown[]) : [];
  const current = queue[0];
  if (!current) throw new EngineError(409, 'S13 下载队列为空，结果无法对账');

  const fileName = String(current.fileName);
  const destName = typeof current.destName === 'string' && current.destName ? String(current.destName) : sanitizeFileNameForFs(fileName);
  const slot = current.slot === 'audio' ? 'audio' : 'word';
  const destAbs = typeof result.destAbs === 'string' ? result.destAbs : null;
  const sha256 = typeof result.sha256 === 'string' ? result.sha256 : null;
  const bytes = Number.isFinite(Number(result.bytes)) ? Number(result.bytes) : 0;
  if (!destAbs || !sha256) throw new EngineError(409, 'S13 下载结果缺少 destAbs/sha256');

  const relPath = `mentors/${step.run.mentorDir}/${step.run.mentorDir} ${slot}/${step.run.mentorDir} 第二轮 interview ${slot}/${destName}`;
  await prisma.contentOpsArtifact.create({
    data: {
      runId: step.runId,
      kind: slot === 'audio' ? 'source_audio' : 'source_transcript',
      path: destAbs,
      displayPath: relPath,
      sha256,
      bytes: BigInt(bytes),
      sourceType: 'primary',
      provenance: JSON.stringify({
        registeredByStep: 'S13',
        round: 2,
        messageId: current.messageId,
        senderName: current.senderName ?? null,
        createTime: current.createTime ?? null,
      }),
      validationStatus: 'verified',
      immutable: true,
    },
  });
  archived.push({
    messageId: current.messageId,
    fileName,
    destName,
    slot,
    bytes,
    sha256,
    at: new Date().toISOString(),
  });
  const rest = queue.slice(1);

  if (rest.length === 0) {
    await prisma.contentOpsStep.update({
      where: { id: step.id },
      data: {
        commandStatus: 'done',
        commandResult: JSON.stringify({ archivedCount: archived.length }),
        evidence: JSON.stringify({ ...evidence, materialQueue: [], materialArchived: archived }),
      },
    });
    await finishStepAndAdvance(step, RUN_STATE.ROUND2_MATERIAL_RECEIVED, { archivedCount: archived.length });
    return;
  }

  // 链式下发下一个
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId }, include: { runner: true } });
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 心跳未携带 CONTENT_ROOT，链式下载中断');
  const next = rest[0];
  const nextSlot = next.slot === 'audio' ? 'audio' : 'word';
  const destDirAbs = round2DestDir(contentRoot, run.mentorDir, nextSlot);
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['dispatched', 'done'] } },
    data: {
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.FEISHU_DOWNLOAD_RESOURCE,
        payload: {
          messageId: next.messageId,
          fileKey: next.fileKey,
          type: 'file',
          destDirAbs,
          destName: typeof next.destName === 'string' && next.destName ? String(next.destName) : sanitizeFileNameForFs(String(next.fileName)),
        },
      }),
      idempotencyKey: `${step.runId}:S13:${randomBytes(6).toString('hex')}`,
      evidence: JSON.stringify({ ...evidence, materialQueue: rest, materialArchived: archived }),
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S13 链式下载冲突：指令状态已变化，请人工检查');
}

// ------------------------------------------------------------------
// S14：Codex 第二轮候选更新（S11 同构；基准包=S11 收步包）
// ------------------------------------------------------------------

export async function startRound2UpdateScan(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  if (![RUN_STATE.ROUND2_MATERIAL_RECEIVED, 'failed'].includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描 work 目录`);
  }
  await ensureStepRows(runId, ['S14']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S14' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.SCAN_WORK_PACKAGES, payload: { mentorDir: run.mentorDir } }),
      idempotencyKey: `${runId}:S14:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S14 已有指令在执行中，请等待完成或失败后再试');
  await audit(userId, 'content_ops.start_round2_update_scan', runId, { mentorDir: run.mentorDir });
  return { queued: true };
}

async function handleRound2UpdateScanResult(step: { id: string; runId: string; evidence: string | null }, result: Record<string, unknown>) {
  const raw = Array.isArray(result.packages) ? result.packages : [];
  const packages: AbsorbPackageMeta[] = raw
    .map((p) => {
      const r = (p ?? {}) as Record<string, unknown>;
      const stat = (r.startHereStat ?? {}) as { mtime?: string; size?: number };
      return {
        name: typeof r.name === 'string' ? r.name : '',
        mtime: typeof stat.mtime === 'string' ? stat.mtime : null,
        size: typeof stat.size === 'number' ? stat.size : undefined,
      };
    })
    .filter((p) => p.name)
    .slice(0, 100);

  const evidence = safeParse(step.evidence);
  const submittedAt = (evidence.codexSubmit as { at?: string } | undefined)?.at ?? null;
  const s11 = await prisma.contentOpsStep.findFirst({ where: { runId: step.runId, code: 'S11' } });
  const previousPackage = (safeParse(s11?.evidence ?? null).absorbConfirm as { workPackage?: string } | undefined)?.workPackage ?? null;
  const pick = submittedAt
    ? pickAbsorbPackages({ packages, previousPackage, submittedAt })
    : {
        packages: packages.map((p) => ({ ...p, isPreviousRound: p.name === previousPackage, afterSubmit: false, recommended: false })),
        ready: false,
        recommended: null,
      };

  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({ packageCount: packages.length, ready: pick.ready, recommended: pick.recommended }),
      status: STEP_STATUS.WAITING_HUMAN,
      evidence: JSON.stringify({
        ...evidence,
        workPackages: pick.packages,
        absorbReady: pick.ready,
        absorbRecommended: pick.recommended,
        scannedAt: new Date().toISOString(),
      }),
    },
  });
}

export async function confirmRound2Update(
  userId: string,
  runId: string,
  input: { submittedToConversation?: boolean; codexThreadId?: string; workPackage?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (![RUN_STATE.ROUND2_MATERIAL_RECEIVED, 'failed'].includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能操作 Codex 第二轮更新`);
  }
  await ensureStepRows(runId, ['S14', 'S15']);
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S14' } });
  const evidence = safeParse(step.evidence);

  if (input.submittedToConversation) {
    const threadId = input.codexThreadId?.trim().slice(0, 120) || null;
    await prisma.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.RUNNING,
        startedAt: step.startedAt ?? new Date(),
        evidence: JSON.stringify({
          ...evidence,
          codexSubmit: { by: userId, at: new Date().toISOString(), codexThreadId: threadId },
        }),
      },
    });
    if (threadId) {
      const contract = safeParse(run.taskContract);
      contract.codexThreadId = threadId;
      await prisma.contentOpsRun.update({ where: { id: runId }, data: { taskContract: JSON.stringify(contract) } });
    }
    await audit(userId, 'content_ops.register_round2_update_submit', runId, { hasThreadId: !!threadId });
    return { ok: true, registered: true };
  }

  const pkg = input.workPackage?.trim();
  if (!evidence.codexSubmit) throw new EngineError(409, '请先确认已在 Codex 专属对话提交第二轮候选更新触发语');
  if (!pkg) throw new EngineError(409, '请选择 Codex 产出的新版本包（先扫描 work 目录）');
  const workPackages = Array.isArray(evidence.workPackages)
    ? (evidence.workPackages as Array<{ name?: string }>).map((p) => p.name).filter((n): n is string => Boolean(n))
    : [];
  if (!workPackages.includes(pkg)) {
    throw new EngineError(409, `所选版本包 ${pkg} 不在已扫描列表中，请重新扫描后选择`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        commandStatus: 'done',
        finishedAt: new Date(),
        evidence: JSON.stringify({
          ...safeParse(step.evidence),
          updateConfirm: { by: userId, at: new Date().toISOString(), workPackage: pkg },
        }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status !== RUN_STATE.CODEX_ROUND2_UPDATE) {
      await transitionRun(tx, fresh, RUN_STATE.CODEX_ROUND2_UPDATE, 'S14 Codex 第二轮更新确认');
    }
    const after = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (after.status === RUN_STATE.CODEX_ROUND2_UPDATE) {
      await transitionRun(tx, after, RUN_STATE.ROUND2_DOCS_QC, 'S14 完成，进入第二轮审核清单质检');
    }
  });
  await audit(userId, 'content_ops.confirm_round2_update', runId, { workPackage: pkg });
  return { ok: true };
}

// ------------------------------------------------------------------
// S15：第二轮审核清单定位 + AI 四维比对（ying wang + phyllis chi 双参考）+ G3 发送
// ------------------------------------------------------------------

export async function startRound2DocsQc(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.ROUND2_DOCS_QC, RUN_STATE.ROUND2_DOCS_QC_FAILED];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能发起第二轮清单比对`);
  }
  await ensureStepRows(runId, ['S15']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  const s14 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S14' } });
  const pkg = (safeParse(s14.evidence).updateConfirm as { workPackage?: string } | undefined)?.workPackage;
  if (!pkg) throw new EngineError(409, 'S14 尚未确认第二轮版本包，无法定位第二轮审核清单');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S15' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.LOCATE_ROUND2_DOCS, payload: { mentorDir: run.mentorDir, packageName: pkg } }),
      idempotencyKey: `${runId}:S15:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S15 已有指令在执行中，请等待完成或失败后再试');
  if (run.status === RUN_STATE.ROUND2_DOCS_QC_FAILED) {
    await transitionRun(prisma, run, RUN_STATE.ROUND2_DOCS_QC, '重新发起第二轮清单定位比对');
  }
  await audit(userId, 'content_ops.start_round2_docs_qc', runId, { packageName: pkg });
  return { queued: true };
}

async function handleLocateRound2DocsResult(
  step: { id: string; runId: string; evidence: string | null; run: { id: string; status: string; mentorDir: string } },
  result: Record<string, unknown>,
) {
  const shapeDoc = (d: Record<string, unknown>) => {
    const rel = typeof d.relPath === 'string' ? d.relPath.replace(/\\/g, '/') : null;
    if (!rel) return null;
    return {
      relPath: rel,
      absPath: typeof d.absPath === 'string' ? d.absPath : null,
      version: typeof d.version === 'string' ? d.version : null,
      bytes: Number(d.bytes ?? 0) || 0,
      sha256: typeof d.sha256 === 'string' ? d.sha256 : null,
      refMentor: typeof d.refMentor === 'string' ? d.refMentor : null,
    };
  };
  type Located = NonNullable<ReturnType<typeof shapeDoc>>;
  const docs = ((Array.isArray(result.docs) ? result.docs : []) as Record<string, unknown>[]).map(shapeDoc).filter(Boolean) as Located[];
  const refs = ((Array.isArray(result.refs) ? result.refs : []) as Record<string, unknown>[]).map(shapeDoc).filter(Boolean) as Located[];
  // 参考集固定为 ying wang + phyllis chi 两位（各自排除被审导师本人时减一）
  const mentorLower = step.run.mentorDir.toLowerCase();
  const refExpect = ['ying wang', 'phyllis chi'].filter((m) => m !== mentorLower).length;
  const missing = [
    docs.length === 0 ? '第二轮审核清单（S14 版本包内）' : null,
    refs.length < refExpect ? `第二轮清单参考（应 ${refExpect} 份：ying wang/phyllis chi 排除被审导师本人）` : null,
  ].filter(Boolean) as string[];
  const ambiguous = docs.length > 1 || refs.length > refExpect;
  const evidence = { locateRound2: { docs, refs, missing, ambiguous, locatedAt: new Date().toISOString() } };

  if (missing.length > 0 || ambiguous) {
    const reason = ambiguous
      ? `第二轮清单定位歧义：候选 ${docs.length} 份/参考 ${refs.length} 份（应为候选 1 份、参考 ${refExpect} 份），请人工确认后重新发起`
      : `未定位到：${missing.join('、')}（命名约定 <Display_Name>_第二轮审核清单_v<版本>.md）`;
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: ambiguous ? 'done' : 'failed',
          commandResult: JSON.stringify({ docCount: docs.length, refCount: refs.length }),
          status: ambiguous ? STEP_STATUS.WAITING_HUMAN : STEP_STATUS.FAILED,
          finishedAt: ambiguous ? undefined : new Date(),
          failureReason: reason,
          evidence: JSON.stringify(evidence),
        },
      });
      const run = await tx.contentOpsRun.findUnique({ where: { id: step.runId } });
      if (run && run.status === RUN_STATE.ROUND2_DOCS_QC && !ambiguous) {
        await transitionRun(tx, run, RUN_STATE.ROUND2_DOCS_QC_FAILED, `S15 定位失败：${missing.join('、')}`);
      }
    });
    return;
  }

  const doc = docs[0];
  await prisma.$transaction(async (tx) => {
    if (doc.absPath && doc.sha256) {
      const existing = await tx.contentOpsArtifact.findUnique({
        where: { runId_path: { runId: step.runId, path: doc.absPath } },
      });
      if (existing && existing.sha256 !== doc.sha256) {
        throw new EngineError(409, `文件内容已变化且曾被登记，禁止覆盖：${doc.relPath}`);
      }
      if (!existing) {
        await tx.contentOpsArtifact.create({
          data: {
            runId: step.runId,
            kind: 'round2_review_doc',
            path: doc.absPath,
            displayPath: doc.relPath,
            sha256: doc.sha256,
            bytes: BigInt(doc.bytes),
            sourceType: 'generated',
            provenance: JSON.stringify({ registeredByStep: 'S15', docType: 'round2_review_checklist', docVersion: doc.version }),
            validationStatus: 'verified',
          },
        });
      }
    }
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        commandStatus: 'done',
        commandResult: JSON.stringify({ docCount: 1, refCount: refs.length }),
        status: STEP_STATUS.WAITING_HUMAN,
        finishedAt: new Date(),
        evidence: JSON.stringify(evidence),
      },
    });
  });
}

/** S15 第二跳：1 候选 + N 参考正文回传，DeepSeek 按第二轮 rubric 评分 */
export async function startRound2AiCompare(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.ROUND2_DOCS_QC, RUN_STATE.ROUND2_DOCS_QC_FAILED];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能发起第二轮 AI 比对`);
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S15' } });
  const ev = safeParse(step.evidence);
  const locate = ev.locateRound2 as
    | {
        docs?: Array<{ absPath: string; sha256: string }>;
        refs?: Array<{ absPath: string; sha256: string; refMentor?: string | null }>;
        ambiguous?: boolean;
      }
    | undefined;
  const refExpect = ['ying wang', 'phyllis chi'].filter((m) => m !== run.mentorDir.toLowerCase()).length;
  if (!locate || locate.ambiguous || !Array.isArray(locate.docs) || locate.docs.length !== 1 || !Array.isArray(locate.refs) || locate.refs.length !== refExpect) {
    throw new EngineError(409, `第二轮定位未完成或仍有歧义（候选 1 份、参考应 ${refExpect} 份），不能发起 AI 比对`);
  }
  const runnerOnline = (run.runner?.lastSeenAt?.getTime() ?? 0) > Date.now() - RUNNER_ONLINE_MS;
  if (!runnerOnline) throw new EngineError(409, 'Runner 离线，无法读取文件正文');

  const items = [...locate.docs.map((d) => ({ ...d, docType: 'round2_review_checklist', refMentor: null })), ...locate.refs.map((r) => ({ ...r, docType: 'round2_review_checklist' }))];
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['done', 'failed'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.READ_VIEW_DOCS, payload: { items } }),
      idempotencyKey: `${runId}:S15AI:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'AI 比对指令已在执行中，请等待结果');
  if (run.status === RUN_STATE.ROUND2_DOCS_QC_FAILED) {
    await transitionRun(prisma, run, RUN_STATE.ROUND2_DOCS_QC, '重新发起 S15 AI 比对');
  }
  await audit(userId, 'content_ops.start_round2_ai_compare', runId, { itemCount: items.length });
  return { queued: true, itemCount: items.length };
}

async function handleReadRound2DocsResult(
  step: { id: string; runId: string; evidence: string | null; run: { id: string; status: string; mentorDir: string } },
  result: Record<string, unknown>,
) {
  const evidence = safeParse(step.evidence);
  const failCompare = async (reason: string) => {
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify({ error: reason }),
          status: STEP_STATUS.FAILED,
          finishedAt: new Date(),
          failureReason: reason,
        },
      });
      const fresh = await tx.contentOpsRun.findUnique({ where: { id: step.runId } });
      if (fresh && fresh.status === RUN_STATE.ROUND2_DOCS_QC) {
        await transitionRun(tx, fresh, RUN_STATE.ROUND2_DOCS_QC_FAILED, `S15 AI 比对失败：${reason}`);
      }
    });
  };

  const locate = evidence.locateRound2 as
    | {
        docs?: Array<{ absPath: string; relPath: string; sha256: string }>;
        refs?: Array<{ absPath: string; relPath: string; sha256: string; refMentor?: string | null }>;
        ambiguous?: boolean;
      }
    | undefined;
  if (!locate || locate.ambiguous || !Array.isArray(locate.docs)) {
    await failCompare('第二轮定位证据缺失或仍有歧义');
    return;
  }
  const items = (Array.isArray(result.results) ? result.results : []) as ReadDocResultItem[];
  const expected = [...(locate.docs ?? []), ...(locate.refs ?? [])];
  if (items.length !== expected.length) {
    await failCompare(`回传文件数量不符（${items.length}/${expected.length}）`);
    return;
  }
  const byAbs = new Map(items.map((i) => [i.absPath, i]));
  for (const d of expected) {
    const it = byAbs.get(d.absPath);
    if (!it || typeof it.content !== 'string') {
      await failCompare(`缺少文件正文：${d.relPath}`);
      return;
    }
    if (it.sha256 !== d.sha256) {
      await failCompare(`正文哈希与定位登记不一致：${d.relPath}`);
      return;
    }
  }
  const candidates = items.filter((i) => !i.refMentor);
  const refs = items.filter((i) => i.refMentor);
  if (candidates.length !== 1 || refs.length < 1) {
    await failCompare(`第二轮应为 1 候选 + 至少 1 参考，实际 ${candidates.length}/${refs.length}`);
    return;
  }

  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
  let scored: DocCompareResult[];
  try {
    scored = await Promise.all(
      candidates.map((it) =>
        scoreViewDoc({
          docType: 'round2_review_checklist',
          mentorDir: run.mentorDir,
          isPilot: Boolean(run.isPilot),
          candidate: { relPath: it.relPath, content: it.content },
          refs: refs.map((r) => ({ refMentor: r.refMentor ?? '', relPath: r.relPath, content: r.content })),
        }),
      ),
    );
  } catch (e) {
    await failCompare(e instanceof Error ? e.message : 'AI 评分失败');
    return;
  }

  const aiPass = allDocsPass(scored);
  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      commandStatus: 'done',
      commandResult: JSON.stringify({ files: scored.map((s) => ({ relPath: s.relPath, scores: s.scores })) }),
      status: STEP_STATUS.WAITING_HUMAN,
      finishedAt: new Date(),
      failureReason: aiPass ? null : 'AI 比对存在低于 80% 的维度，等待人工裁决',
      evidence: JSON.stringify({
        ...evidence,
        compareRound2: { results: scored, aiPass, at: new Date().toISOString() },
      }),
    },
  });
}

/** S15 人工裁决（门槛同 S8：AI 全绿建议放行；<80 override 需 10 字；驳回需 5 字） */
export async function submitRound2Qc(userId: string, runId: string, input: { decision?: string; note?: string }) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.ROUND2_DOCS_QC) {
    throw new EngineError(409, `当前状态（${run.status}）不能提交第二轮裁决`);
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S15' } });
  const evidence = safeParse(step.evidence);
  const compare = evidence.compareRound2 as { results: DocCompareResult[]; aiPass: boolean; at: string } | undefined;
  if (!compare) throw new EngineError(409, '尚未完成第二轮 AI 比对，不能提交裁决');
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const decision = input.decision;

  if (decision === 'reject') {
    if (note.length < 5) throw new EngineError(400, '驳回必须填写具体原因（至少 5 个字），用于在 Codex 对话中要求修订');
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          status: STEP_STATUS.FAILED,
          finishedAt: new Date(),
          failureReason: `人工驳回：${note}`,
          evidence: JSON.stringify({
            ...evidence,
            qcRound2: { decision: 'reject', note, decidedBy: userId, decidedAt: new Date().toISOString() },
          }),
        },
      });
      const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
      await transitionRun(tx, fresh, RUN_STATE.ROUND2_DOCS_QC_FAILED, `S15 人工驳回：${note}`);
    });
    await audit(userId, 'content_ops.submit_round2_qc', runId, { verdict: 'reject' });
    return { ok: true, verdict: 'reject' };
  }
  if (decision !== 'pass') throw new EngineError(400, '裁决结论必须是 pass 或 reject');
  const overridden = !compare.aiPass;
  if (overridden && note.length < 10) {
    throw new EngineError(400, 'AI 评定有维度低于 80%，人工放行必须填写依据说明（至少 10 个字）');
  }
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.WAITING_HUMAN,
        finishedAt: new Date(),
        failureReason: null,
        evidence: JSON.stringify({
          ...evidence,
          qcRound2: {
            decision: 'pass',
            aiPass: compare.aiPass,
            overridden,
            note: note || null,
            decidedBy: userId,
            decidedAt: new Date().toISOString(),
          },
        }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status !== RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_DOCS) {
      await transitionRun(tx, fresh, RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_DOCS, overridden ? 'S15 人工 override AI 结论放行' : 'S15 AI 比对通过');
    }
  });
  await audit(userId, 'content_ops.submit_round2_qc', runId, { verdict: 'pass', overridden });
  return { ok: true, verdict: 'pass', overridden };
}

export async function approveSendRound2Docs(
  userId: string,
  runId: string,
  input: { confirm?: { filesRead?: boolean; qcSeen?: boolean; chatConfirmed?: boolean; copyUnchanged?: boolean } },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  if (run.status !== RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_DOCS) {
    throw new EngineError(409, `当前状态（${run.status}）不能批准发送第二轮清单`);
  }
  const c = {
    filesRead: input.confirm?.filesRead === true,
    qcSeen: input.confirm?.qcSeen === true,
    chatConfirmed: input.confirm?.chatConfirmed === true,
    copyUnchanged: input.confirm?.copyUnchanged === true,
  };
  if (!Object.values(c).every(Boolean)) throw new EngineError(409, '证据核对勾未完成（四项须全部勾选）');
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  if (!run.feishuChatId) throw new EngineError(409, 'Run 未绑定飞书群，禁止发送');
  const docCount = await prisma.contentOpsArtifact.count({ where: { runId, kind: 'round2_review_doc' } });
  if (docCount !== 1) throw new EngineError(409, `第二轮审核清单应为 1 份（当前登记 ${docCount} 份），禁止发送`);
  const docs = await prisma.contentOpsArtifact.findMany({ where: { runId, kind: 'round2_review_doc' } });
  const dedupBase = `g3:${run.feishuChatId}:${docs.map((d) => d.sha256.slice(0, 12)).join(':')}`;
  const dup = await prisma.contentOpsFeishuMessage.findFirst({
    where: { dedupKey: { startsWith: dedupBase }, status: 'sent' },
  });
  if (dup) throw new EngineError(409, '该第二轮清单已发送过，禁止重复发送');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S15' } });
  const firstPayload = await buildS15SendPayload(runId, run.feishuChatId, 0, dedupBase);
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['done', 'failed'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.FEISHU_SEND_MESSAGE, payload: firstPayload }),
      idempotencyKey: `${runId}:S15:${randomBytes(6).toString('hex')}`,
      failureReason: null,
      evidence: JSON.stringify({
        ...safeParse(step.evidence),
        sendPlan: [
          { kind: 'file', label: '第二轮审核清单（需回复）' },
          { kind: 'text', label: 'G3 固定文案' },
        ],
        dedupKeyBase: dedupBase,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        sendLog: [],
      }),
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S15 已有发送指令在执行中');

  await prisma.contentOpsApproval.create({
    data: {
      runId,
      gate: 'G3',
      stepCode: 'S15',
      buttonName: '批准发送：第二轮审核清单',
      scope: `仅本次向群 ${run.feishuChatName ?? run.feishuChatId} 发送 1 份第二轮审核清单 + 1 条 G3 固定文案`,
      checks: JSON.stringify(c),
      status: 'approved',
      actorId: userId,
    },
  });
  for (let i = 0; i < 2; i += 1) {
    await prisma.contentOpsFeishuMessage.create({
      data: {
        runId,
        dedupKey: `${dedupBase}#${i}`,
        chatId: run.feishuChatId,
        direction: 'outbound',
        templateId: i === 1 ? 'g3_round2_docs_text' : null,
        status: 'pending',
        createdBy: 'runner',
      },
    });
  }
  await audit(userId, 'content_ops.approve_send_round2_docs', runId, { gate: 'G3' });
  return { queued: true };
}

/** S15 人工补录 */
export async function markRound2DocsManualSend(
  userId: string,
  runId: string,
  input: { confirm?: { fileSent?: boolean; textSent?: boolean }; note?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const allowed = [RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_DOCS, 'failed'];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能登记人工发送`);
  }
  const c = { fileSent: input.confirm?.fileSent === true, textSent: input.confirm?.textSent === true };
  if (!c.fileSent || !c.textSent) throw new EngineError(409, '请先勾选确认第二轮清单文件与 G3 文案均已人工发送');
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S15' } });
  const evidence = safeParse(step.evidence);
  const base = (evidence.dedupKeyBase as string | undefined) ?? `g3:manual:${run.feishuChatId ?? 'unknown'}:${Date.now()}`;
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        commandStatus: 'done',
        finishedAt: new Date(),
        failureReason: null,
        evidence: JSON.stringify({
          ...evidence,
          manualSend: { by: userId, at: new Date().toISOString(), note: input.note?.slice(0, 300) ?? null, dedupKeyBase: base },
        }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status !== RUN_STATE.ROUND2_DOCS_SENT) {
      await transitionRun(tx, fresh, RUN_STATE.ROUND2_DOCS_SENT, 'S15 人工发送登记');
    }
    const after = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (after.status === RUN_STATE.ROUND2_DOCS_SENT) {
      await transitionRun(tx, after, RUN_STATE.WAITING_ROUND2_REVIEW_REPLY, 'S15 人工发送登记完成，等待第二轮回复');
    }
    for (let i = 0; i < 2; i += 1) {
      const key = `${base}#${i}`;
      const existing = await tx.contentOpsFeishuMessage.findUnique({ where: { dedupKey: key } });
      if (existing) {
        await tx.contentOpsFeishuMessage.update({ where: { dedupKey: key }, data: { status: 'sent', createdBy: 'human', sentAt: new Date() } });
      } else {
        await tx.contentOpsFeishuMessage.create({
          data: {
            runId,
            dedupKey: key,
            chatId: run.feishuChatId ?? 'unknown',
            direction: 'outbound',
            templateId: i === 1 ? 'g3_round2_docs_text' : null,
            status: 'sent',
            createdBy: 'human',
            sentAt: new Date(),
          },
        });
      }
    }
  });
  await audit(userId, 'content_ops.mark_round2_docs_manual_send', runId, {});
  return { ok: true };
}

// ------------------------------------------------------------------
// S16：第二轮审核清单回复归档（round2）+ Codex 最终吸收（不选包，S17 再发现）
// ------------------------------------------------------------------

export async function startRound2ReplyScan(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const allowed: string[] = [
    RUN_STATE.ROUND2_DOCS_SENT,
    RUN_STATE.WAITING_ROUND2_REVIEW_REPLY,
    RUN_STATE.ROUND2_REPLY_RECEIVED,
  ];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能扫描第二轮回复`);
  }
  if (!run.feishuChatId) throw new EngineError(409, 'Run 未绑定飞书群，无法扫描群消息');
  await ensureStepRows(runId, ['S16']);
  if (run.status === RUN_STATE.ROUND2_DOCS_SENT) {
    await transitionRun(prisma, run, RUN_STATE.WAITING_ROUND2_REVIEW_REPLY, 'S16 回复扫描发起');
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S16' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.FEISHU_LIST_MESSAGES,
        payload: { chatId: run.feishuChatId, limit: 200, order: 'desc' },
      }),
      idempotencyKey: `${runId}:S16:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S16 已有指令在执行中，请等待完成或失败后再试');
  await audit(userId, 'content_ops.start_round2_reply_scan', runId, { chatId: run.feishuChatId });
  return { queued: true };
}

export async function submitRound2Reply(userId: string, runId: string, input: { messageId?: string; manualRelPath?: string }) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.WAITING_ROUND2_REVIEW_REPLY, RUN_STATE.ROUND2_REPLY_RECEIVED];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能归档第二轮回复`);
  }
  await ensureStepRows(runId, ['S16']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S16' } });
  const evidence = safeParse(step.evidence);
  const mentorPrefix = `mentors/${run.mentorDir}/`;

  if (input.manualRelPath) {
    const rel = input.manualRelPath.trim().replace(/\\/g, '/');
    if (!rel.startsWith(mentorPrefix) || rel.includes('..') || rel === mentorPrefix) {
      throw new EngineError(409, `手工登记路径必须在导师目录内（${mentorPrefix}<文件名>）`);
    }
    if (!/\.(md|txt|docx?|pdf)$/i.test(rel)) {
      throw new EngineError(409, '手工登记仅支持文档类文件（md/txt/doc/docx/pdf），回复不收音频');
    }
    const fileName = rel.slice(mentorPrefix.length).split('/').pop() ?? '';
    const updated = await prisma.contentOpsStep.updateMany({
      where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
      data: {
        status: STEP_STATUS.RUNNING,
        commandStatus: 'queued',
        commandPayload: JSON.stringify({
          type: COMMAND.HASH_FILES,
          payload: {
            items: [{ path: `${contentRoot}\\${rel.replace(/\//g, '\\')}` }],
            files: [{ relPath: rel, kind: 'round2_reply', sourceType: 'primary', note: 'S16 手工登记兜底' }],
          },
        }),
        idempotencyKey: `${runId}:S16:${randomBytes(6).toString('hex')}`,
        failureReason: null,
        evidence: JSON.stringify({
          ...evidence,
          replySelectionRound2: {
            fileName,
            senderName: '人工登记',
            messageId: null,
            createTime: null,
            destName: fileName,
            manual: true,
            selectedBy: userId,
            selectedAt: new Date().toISOString(),
          },
        }),
      },
    });
    if (updated.count === 0) throw new EngineError(409, 'S16 已有指令在执行中，请等待完成或失败后再试');
    await audit(userId, 'content_ops.submit_round2_reply_manual', runId, { relPath: rel });
    return { queued: true, destName: fileName };
  }

  const scan = evidence.replyScanRound2 as { candidates?: ReplyCandidate[] } | undefined;
  const candidate = scan?.candidates?.find((c) => c.messageId === input.messageId);
  if (!candidate || !candidate.fileKey) {
    throw new EngineError(409, '所选消息不在已扫描候选中（或缺少文件标识），请重新扫描后选择');
  }
  const destName = buildReplyFileName(candidate.fileName);
  const destDirAbs = `${contentRoot}\\mentors\\${run.mentorDir}`;
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.FEISHU_DOWNLOAD_RESOURCE,
        payload: { messageId: candidate.messageId, fileKey: candidate.fileKey, type: 'file', destDirAbs, destName },
      }),
      idempotencyKey: `${runId}:S16:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S16 已有指令在执行中，请等待完成或失败后再试');
  await prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      evidence: JSON.stringify({
        ...evidence,
        replySelectionRound2: {
          messageId: candidate.messageId,
          fileName: candidate.fileName,
          senderName: candidate.senderName,
          createTime: candidate.createTime,
          destName,
          selectedBy: userId,
          selectedAt: new Date().toISOString(),
        },
      }),
    },
  });
  await audit(userId, 'content_ops.submit_round2_reply', runId, { messageId: candidate.messageId, destName });
  return { queued: true, destName };
}

/**
 * S16 Codex 最终吸收（S11 同构沟通区，但不选包——最终交接包由 S17 按不可变规则发现）：
 * - submittedToConversation：登记已在专属对话提交 §14.4 固定触发语；
 * - absorbCompleted：人工确认 Codex 已完成最终吸收（规范 §14.5：不得自动解释为允许集成）。
 */
export async function confirmRound2Absorb(
  userId: string,
  runId: string,
  input: { submittedToConversation?: boolean; absorbCompleted?: boolean; codexThreadId?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.ROUND2_REPLY_RECEIVED) {
    throw new EngineError(409, `当前状态（${run.status}）不能操作 Codex 最终吸收`);
  }
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S16' } });
  const evidence = safeParse(step.evidence);
  if (!evidence.archivedReplyRound2 && !(evidence.replySelectionRound2 as { manual?: boolean } | undefined)?.manual) {
    throw new EngineError(409, '第二轮审核清单回复尚未归档完成，不能通知 Codex 吸收');
  }

  if (input.submittedToConversation) {
    const threadId = input.codexThreadId?.trim().slice(0, 120) || null;
    await prisma.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.RUNNING,
        startedAt: step.startedAt ?? new Date(),
        evidence: JSON.stringify({
          ...evidence,
          codexSubmit: { by: userId, at: new Date().toISOString(), codexThreadId: threadId },
        }),
      },
    });
    if (threadId) {
      const contract = safeParse(run.taskContract);
      contract.codexThreadId = threadId;
      await prisma.contentOpsRun.update({ where: { id: runId }, data: { taskContract: JSON.stringify(contract) } });
    }
    await audit(userId, 'content_ops.register_round2_absorb_submit', runId, { hasThreadId: !!threadId });
    return { ok: true, registered: true };
  }

  if (input.absorbCompleted) {
    if (!evidence.codexSubmit) throw new EngineError(409, '请先确认已在 Codex 专属对话提交最终吸收触发语');
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          status: STEP_STATUS.DONE,
          commandStatus: 'done',
          finishedAt: new Date(),
          evidence: JSON.stringify({
            ...safeParse(step.evidence),
            finalAbsorbConfirm: { by: userId, at: new Date().toISOString() },
          }),
        },
      });
      const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
      if (fresh.status !== RUN_STATE.CODEX_FINAL_ABSORB) {
        await transitionRun(tx, fresh, RUN_STATE.CODEX_FINAL_ABSORB, 'S16 Codex 最终吸收人工确认（不代表允许集成）');
      }
    });
    await audit(userId, 'content_ops.confirm_round2_absorb', runId, {});
    return { ok: true };
  }

  throw new EngineError(400, '缺少动作参数（submittedToConversation / absorbCompleted）');
}

// ------------------------------------------------------------------
// P4a：S17-S20 Final Handoff 发现 + 九类预检 + pending 归零 + G4 第一次门禁
// 依据：D:\database\AGENTS.md §16-§18
// ------------------------------------------------------------------

/** S17：Final Handoff 发现 —— 下发 SCAN_FINAL_HANDOFF 指令给 Runner，定位最新有效不可变包 */
export async function discoverFinalHandoff(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.CODEX_FINAL_ABSORB, RUN_STATE.FINAL_HANDOFF_BLOCKED];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能发起 Final Handoff 发现`);
  }
  await ensureStepRows(runId, ['S17']);
  const { contentRoot } = parseHeartbeat(run.runner?.lastHeartbeat ?? null);
  if (!contentRoot) throw new EngineError(409, 'Runner 不在线或未上报 CONTENT_ROOT');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S17' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.SCAN_FINAL_HANDOFF,
        payload: { mentorDir: run.mentorDir, contentRoot },
      }),
      idempotencyKey: `${runId}:S17:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S17 已有指令在执行中，请等待完成或失败后再试');

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status === RUN_STATE.CODEX_FINAL_ABSORB) {
      await transitionRun(tx, fresh, RUN_STATE.FINAL_HANDOFF_DISCOVERED, 'S17 Final Handoff 发现指令已下发');
    }
  });
  await audit(userId, 'content_ops.discover_final_handoff', runId, { mentorDir: run.mentorDir });
  return { queued: true };
}

/** S17 指令结果处理：定位包路径/版本/四件套；失败转 final_handoff_blocked */
async function handleScanFinalHandoffResult(
  step: { id: string; runId: string; evidence: string | null; run: { id: string; status: string; mentorDir: string } },
  result: Record<string, unknown>,
) {
  const packagePath = typeof result.packagePath === 'string' ? result.packagePath : null;
  const version = typeof result.version === 'string' ? result.version : null;
  const coreFiles = Array.isArray(result.coreFiles) ? result.coreFiles : [];
  const required = ['00_START_HERE.md', 'source_manifest_final.json', 'TRAE_HANDOFF.md', 'VALIDATION_REPORT.md'];
  const present = new Set(
    (coreFiles as Array<{ name?: string; exists?: boolean }>).filter((f) => f.exists).map((f) => f.name ?? ''),
  );
  const missing = required.filter((n) => !present.has(n));
  const hashBaseline = (coreFiles as Array<{ name?: string; sha256?: string }>)
    .filter((f) => f.sha256)
    .map((f) => `${f.name}:${(f.sha256 ?? '').slice(0, 8)}`);

  if (!packagePath || !version || missing.length > 0) {
    const reason = !packagePath
      ? '未定位到最新有效不可变 Final Handoff 包（命名约定 <mentorId>-final-handoff-v<actual>）'
      : `四件套缺 ${missing.length} 个：${missing.join('、')}`;
    await prisma.$transaction(async (tx) => {
      await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'failed',
          commandResult: JSON.stringify({ packagePath, version, missing }),
          status: STEP_STATUS.FAILED,
          finishedAt: new Date(),
          failureReason: reason,
          evidence: JSON.stringify({ ...safeParse(step.evidence), discovered: { packagePath, version, missing, hashBaseline } }),
        },
      });
      const run = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
      if (run.status === RUN_STATE.FINAL_HANDOFF_DISCOVERED) {
        await transitionRun(tx, run, RUN_STATE.FINAL_HANDOFF_BLOCKED, `S17 定位失败：${reason}`);
      }
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        commandStatus: 'done',
        commandResult: JSON.stringify({ packagePath, version }),
        status: STEP_STATUS.DONE,
        finishedAt: new Date(),
        evidence: JSON.stringify({
          ...safeParse(step.evidence),
          discovered: { packagePath, version, coreFiles, hashBaseline, discoveredAt: new Date().toISOString() },
        }),
      },
    });
    const run = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
    // retry 场景：run 可能停在 failed（旧 Runner 报失败后 retryCommand 未恢复主线状态），
    // 成功结果到来时需从 failed 直接推进到 FINAL_HANDOFF_PREFLIGHT
    if (run.status === RUN_STATE.FINAL_HANDOFF_DISCOVERED || run.status === RUN_STATE.FINAL_HANDOFF_BLOCKED || run.status === 'failed') {
      await transitionRun(tx, run, RUN_STATE.FINAL_HANDOFF_PREFLIGHT, 'S17 定位完成，进入九类预检');
    }
  });
}

/** S18：九类预检 —— 下发 PREFLIGHT_CHECKS 指令，Runner 回传 HandoffPackageMeta 后由 preflight-checks.runAllChecks 校验 */
export async function runPreflightNineChecks(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.FINAL_HANDOFF_PREFLIGHT, RUN_STATE.FINAL_HANDOFF_BLOCKED];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能发起 Final Handoff 预检`);
  }
  await ensureStepRows(runId, ['S18']);
  const s17 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S17' } });
  const discovered = (safeParse(s17.evidence).discovered as { packagePath?: string; version?: string } | undefined);
  if (!discovered?.packagePath) throw new EngineError(409, 'S17 尚未定位到 Final Handoff 包，无法预检');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S18' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.PREFLIGHT_CHECKS,
        payload: {
          mentorDir: run.mentorDir,
          packagePath: discovered.packagePath,
          version: discovered.version ?? '',
        },
      }),
      idempotencyKey: `${runId}:S18:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S18 已有指令在执行中，请等待完成或失败后再试');
  if (run.status === RUN_STATE.FINAL_HANDOFF_BLOCKED) {
    await transitionRun(prisma, run, RUN_STATE.FINAL_HANDOFF_PREFLIGHT, '重新发起九类预检');
  }
  await audit(userId, 'content_ops.run_preflight', runId, { packagePath: discovered.packagePath });
  return { queued: true };
}

/** S18 指令结果处理：Runner 回传 Final Handoff 包内原始文件内容，控制平面解析后调用 preflight-checks.runAllChecks */
async function handlePreflightChecksResult(
  step: { id: string; runId: string; evidence: string | null; run: { id: string; status: string; mentorDir: string } },
  result: Record<string, unknown>,
) {
  // Runner 回传字段：packagePath/version/coreFiles/missing/manifestText/traeHandoffText/validationText/knowledgeCards/promptSystemSnapshot
  const coreFiles = (Array.isArray(result.coreFiles) ? result.coreFiles : []) as HandoffPackageMeta['coreFiles'];

  // 解析 source_manifest_final.json（先解析，后面 knowledgeCards 字段映射要交叉引用 sources[]）
  let sourceManifest: Record<string, unknown> | null = null;
  if (typeof result.manifestText === 'string') {
    try { sourceManifest = JSON.parse(result.manifestText); } catch { sourceManifest = null; }
  }

  // 字段映射：JSONL 原始对象 → KnowledgeCardSpec（Runner 回传的是原始 JSONL 行，字段名与接口可能不一致）
  const manifestSources = (sourceManifest && Array.isArray((sourceManifest as Record<string, unknown>).sources)
    ? (sourceManifest as Record<string, unknown>).sources
    : []) as Array<Record<string, unknown>>;
  const sourceMap = new Map<string, { sha256: string; bytes: number }>();
  for (const s of manifestSources) {
    const sid = typeof s.sourceId === 'string' ? s.sourceId : (typeof s.id === 'string' ? s.id : '');
    const sha = typeof s.sha256 === 'string' ? s.sha256 : (typeof s.hash === 'string' ? s.hash : '');
    const bytes = typeof s.bytes === 'number' ? s.bytes : (typeof s.size === 'number' ? s.size : 0);
    if (sid && sha) sourceMap.set(sid, { sha256: sha, bytes });
  }
  const rawCards = Array.isArray(result.knowledgeCards) ? result.knowledgeCards : [];
  const knowledgeCards: KnowledgeCardSpec[] = rawCards.map((raw: unknown) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const cardId = String(c.cardId ?? '');
    // round 从 cardId 提取（YWP-R1-xxx → 1, YWP-R2-xxx → 2）；JSONL 可能没有独立 round 字段
    const roundMatch = cardId.match(/-R(\d)-/);
    const round = roundMatch ? parseInt(roundMatch[1], 10) : (typeof c.round === 'number' ? c.round : 0);
    // sourceSha256/sourceBytes 从 card.source[] 交叉引用 manifest.sources[]
    const sourceArr = Array.isArray(c.source) ? (c.source as unknown[]) : [];
    let sourceSha256: string | null = null;
    let sourceBytes: number | null = null;
    for (const src of sourceArr) {
      const srcStr = typeof src === 'string' ? src
        : (src && typeof src === 'object' && 'sourceId' in src ? String((src as Record<string, unknown>).sourceId) : '');
      const sourceId = srcStr.split('@')[0];
      const found = sourceMap.get(sourceId);
      if (found) { sourceSha256 = found.sha256; sourceBytes = found.bytes; break; }
    }
    return {
      cardId,
      mentorId: String(c.mentorId ?? ''),
      round,
      knowledgeClass: String(c.knowledgeClass ?? '') as KnowledgeCardSpec['knowledgeClass'],
      disclosureMode: String(c.disclosureMode ?? '') as KnowledgeCardSpec['disclosureMode'],
      sourceSha256,
      sourceBytes,
      hasCase: c.caseText != null && String(c.caseText).trim() !== '',
    } as KnowledgeCardSpec;
  });

  // 解析 TRAE_HANDOFF.md（正则适配实际文档格式：列表项 "- Prompt：`path`" 等）
  const thText = typeof result.traeHandoffText === 'string' ? result.traeHandoffText : '';
  const traeHandoff: HandoffPackageMeta['traeHandoff'] = thText
    ? {
        // 匹配 "- Prompt：`path`" 行（排除 "Prompt System："）
        candidatePromptPath: (thText.match(/^\s*-\s*Prompt\s*[：:]\s*[`'"]?([^\n`'"\]]+)/mi)?.[1] ?? null),
        candidatePromptSha256: (thText.match(/Prompt.*sha-?256[：:\s]*([a-f0-9]+)/i)?.[1] ?? null),
        // 匹配 "- 知识：`path`" 行（兼容 "知识快照："）
        knowledgeSnapshotPath: (thText.match(/^\s*-\s*知识(?:快照)?\s*[：:]\s*[`'"]?([^\n`'"\]]+)/mi)?.[1] ?? null),
        // 匹配 "集成到 `path`" 或 "目标路径："
        targetAppPaths: thText.match(/集成到\s*[`'"]?([^\n`'"\]。]+)/i)?.[1]?.split(/[，,、\s]+/).filter(Boolean) ?? [],
        // 匹配 "测试目标" 或 "测试清单" 章节存在
        testList: /测试(目标|清单|计划)/i.test(thText) ? ['（见文档测试章节）'] : [],
        // 匹配 "回滚" 相关描述（不要求 "回滚：" 格式）
        rollbackPlan: thText.match(/回滚[^\n]{0,60}/i)?.[0] ?? null,
        // 匹配 "回传：" 行
        writebackRequirements: thText.match(/回传[：:]\s*(.+)/i)?.[1]?.split(/[，,、\s]+/).filter(Boolean) ?? [],
        hasSingleCandidate: /单一候选/i.test(thText),
      }
    : null;

  // 候选 Prompt SHA-256：如果 TRAE_HANDOFF 文档里没写，从 coreFiles 按文件名查查找补全
  if (traeHandoff && !traeHandoff.candidatePromptSha256 && traeHandoff.candidatePromptPath) {
    const promptName = traeHandoff.candidatePromptPath.split(/[\\/]/).pop() ?? traeHandoff.candidatePromptPath;
    // 先精确匹配文件名
    let found = coreFiles.find((f) => f.name === promptName || (f.relPath && f.relPath.includes(promptName)));
    // 精确匹配失败时，去掉版本号模糊匹配（文档写 v0.4 但文件是 v0.3）
    if (!found) {
      const baseName = promptName.replace(/v\d+\.\d+/i, '');
      found = coreFiles.find((f) => f.name.replace(/v\d+\.\d+/i, '') === baseName);
    }
    // 再退一步：按关键词匹配（SystemPrompt + candidate）
    if (!found) {
      found = coreFiles.find((f) => /SystemPrompt/i.test(f.name) && /candidate/i.test(f.name));
    }
    if (found?.sha256) traeHandoff.candidatePromptSha256 = found.sha256;
  }

  // 解析 VALIDATION_REPORT.md（正则匹配 + 整体回退）
  const vrText = typeof result.validationText === 'string' ? result.validationText : '';
  const hasOverallPass = /PASS/i.test(vrText) || /通过/i.test(vrText);
  const hasFail = /FAIL/i.test(vrText) || /未通过/i.test(vrText);
  const overallStatus: 'pass' | 'fail' | 'unknown' = hasFail ? 'fail' : hasOverallPass ? 'pass' : 'unknown';
  const pickStatus = (key: string): 'pass' | 'fail' | 'unknown' => {
    // 先精确匹配关键词 + pass/fail/unknown
    const m = vrText.match(new RegExp(`${key}[^\n]*(pass|fail|unknown)`, 'i'));
    if (m) return m[1].toLowerCase() as 'pass' | 'fail' | 'unknown';
    // 再匹配中文关键词 + 通过/未通过
    const cnMap: Record<string, string> = { schema: 'schema|Schema', source: 'source|来源', classification: 'class|分类', privacy: 'privacy|隐私', audio: 'audio|音频' };
    const cn = vrText.match(new RegExp(`(${cnMap[key] ?? key})[^\\n]*(通过|未通过|pass|fail)`, 'i'));
    if (cn) return (cn[2].toLowerCase() === '通过' || cn[2].toLowerCase() === 'pass') ? 'pass' : 'fail';
    // 回退到整体报告状态
    return overallStatus;
  };
  const validationReport: HandoffPackageMeta['validationReport'] = vrText
    ? {
        schema: pickStatus('schema'),
        source: pickStatus('source'),
        classification: pickStatus('classification'),
        privacy: pickStatus('privacy'),
        prompt: pickStatus('prompt'),
        fullPackage: pickStatus('full'),
        audioCoverage: pickStatus('audio'),
      }
    : { schema: 'unknown', source: 'unknown', classification: 'unknown', privacy: 'unknown', prompt: 'unknown', fullPackage: 'unknown', audioCoverage: 'unknown' };

  // Prompt System 快照（Runner 已 JSON.parse）
  const promptSystemSnapshot = (result.promptSystemSnapshot ?? null) as HandoffPackageMeta['promptSystemSnapshot'];

  // baseline/app 集成快照：第一版留空（双快照对账会 warn）
  const handoff: HandoffPackageMeta = {
    packagePath: typeof result.packagePath === 'string' ? result.packagePath : '',
    version: typeof result.version === 'string' ? result.version : '',
    coreFiles,
    sourceManifest,
    traeHandoff,
    validationReport,
    knowledgeCards,
    promptSystemSnapshot,
    baselineSnapshot: null,
    appIntegrationSnapshot: null,
  };

  const input: PreflightInput = {
    runId: step.runId,
    mentorDir: step.run.mentorDir,
    handoff,
  };
  const output = runAllChecks(input);
  const reason = output.results.find((r) => r.status === 'fail');

  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        commandStatus: 'done',
        commandResult: JSON.stringify({ allPass: output.allPass, pendingCount: output.pendingCount }),
        status: output.allPass ? STEP_STATUS.DONE : STEP_STATUS.FAILED,
        finishedAt: new Date(),
        failureReason: reason ? `${reason.label}：${reason.reason ?? '—'}` : null,
        evidence: JSON.stringify({
          ...safeParse(step.evidence),
          preflight: { results: output.results, allPass: output.allPass, pendingCount: output.pendingCount, checkedAt: new Date().toISOString() },
        }),
      },
    });
    const run = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
    if (output.allPass) {
      const target = (output.pendingCount.external + output.pendingCount.internal) === 0
        ? RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL
        : RUN_STATE.READY_FOR_INTEGRATION;
      if (run.status === RUN_STATE.FINAL_HANDOFF_PREFLIGHT || run.status === RUN_STATE.FINAL_HANDOFF_BLOCKED) {
        // 无 pending 卡时跳过 S19，标记 S19 为 done
        if (target === RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL) {
          await prisma.contentOpsStep.updateMany({
            where: { runId: step.runId, code: 'S19', status: { not: STEP_STATUS.DONE } },
            data: { status: STEP_STATUS.DONE, finishedAt: new Date() },
          });
        }
        await transitionRun(tx, run, target, target === RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL ? 'S18 九类预检全过且无 pending，跳过 S19 直接进入 G4 门禁' : 'S18 九类预检全过，等待 S19 pending 归零');
      }
    } else {
      if (run.status === RUN_STATE.FINAL_HANDOFF_PREFLIGHT) {
        await transitionRun(tx, run, RUN_STATE.FINAL_HANDOFF_BLOCKED, `S18 预检失败：${reason?.label ?? ''}`);
      }
    }
  });
}

/** S19：列出 pending 卡（下发 RESOLVE_PENDING_CARD 给 Runner 只读扫描） */
export async function listPendingCards(userId: string, runId: string) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId }, include: { runner: true } });
  const allowed: string[] = [RUN_STATE.READY_FOR_INTEGRATION, RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能列出 pending 卡`);
  }
  await ensureStepRows(runId, ['S19']);
  const s17 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S17' } });
  const discovered = (safeParse(s17.evidence).discovered as { packagePath?: string } | undefined);
  if (!discovered?.packagePath) throw new EngineError(409, 'S17 尚未定位到 Final Handoff 包');

  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S19' } });
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['none', 'failed', 'done'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: step.startedAt ?? new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({
        type: COMMAND.RESOLVE_PENDING_CARD,
        payload: { mentorDir: run.mentorDir, packagePath: discovered.packagePath },
      }),
      idempotencyKey: `${runId}:S19:list:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) throw new EngineError(409, 'S19 已有指令在执行中，请等待完成或失败后再试');
  await audit(userId, 'content_ops.list_pending_cards', runId, {});
  return { queued: true };
}

/** S19：提交单张 pending 卡的处置结果（Trae 无升级权，Codex 在专属对话处置后人工回填） */
export async function submitPendingDisposition(
  userId: string,
  runId: string,
  input: { cardId: string; disposition: 'external_approved_generalized' | 'external_approved_exact' | 'internal_approved_none' | 'exclude' | 'keep_pending'; note?: string },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.READY_FOR_INTEGRATION) {
    throw new EngineError(409, `当前状态（${run.status}）不能提交 pending 处置`);
  }
  if (!input.cardId || input.cardId.length === 0) throw new EngineError(400, '缺少 cardId');
  await ensureStepRows(runId, ['S19']);
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S19' } });
  const evidence = safeParse(step.evidence);
  const dispositions = Array.isArray((evidence.pendingDispositions as Array<{ cardId: string }> | undefined))
    ? ((evidence.pendingDispositions as Array<{ cardId: string; disposition: string; note?: string | null; at: string; by: string }>) ?? [])
    : [];
  // 幂等+单卡单状态约束：同 cardId 已处置则覆盖（防并发竞态「同卡既 approved 又 pending」）
  const filtered = dispositions.filter((d) => d.cardId !== input.cardId);
  filtered.push({
    cardId: input.cardId,
    disposition: input.disposition,
    note: input.note?.slice(0, 500) ?? null,
    at: new Date().toISOString(),
    by: userId,
  });
  // 检查是否全部 pending 已收敛：从 S18 step 读 pendingCount，与已处置 dispositions 比对
  const s18 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S18' } });
  const preflight = (safeParse(s18.evidence).preflight as { pendingCount?: { external: number; internal: number } } | undefined);
  const totalPending = (preflight?.pendingCount?.external ?? 0) + (preflight?.pendingCount?.internal ?? 0);
  // keep_pending 不算收敛；exclude/external_approved/internal_approved 算收敛
  const settledCount = filtered.filter((d) => d.disposition !== 'keep_pending').length;
  const keepPendingCount = filtered.filter((d) => d.disposition === 'keep_pending').length;
  const allSettled = totalPending > 0 && settledCount >= totalPending && keepPendingCount === 0;

  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: allSettled ? STEP_STATUS.DONE : STEP_STATUS.RUNNING,
        startedAt: step.startedAt ?? new Date(),
        finishedAt: allSettled ? new Date() : null,
        evidence: JSON.stringify({ ...evidence, pendingDispositions: filtered, allSettled }),
      },
    });
    if (allSettled) {
      const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
      if (fresh.status === RUN_STATE.READY_FOR_INTEGRATION) {
        await transitionRun(tx, fresh, RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL, 'S19 pending 卡全部归零');
      }
    }
  });
  await audit(userId, 'content_ops.submit_pending_disposition', runId, { cardId: input.cardId, disposition: input.disposition, allSettled });

  return { ok: true, settledCount, keepPendingCount, totalPending, allSettled, dispositions: filtered };
}

/** S20：G4 第一次人工门禁 —— 用户点击「确认交给Trae集成至main和测试端」 */
export async function requestG4Approval(
  userId: string,
  runId: string,
  input: { evidenceChecks: { preflightAllPassed: boolean; pendingAllZeroed: boolean; handoffVersionAndHashRecorded: boolean; readNoMasterProduction: boolean } },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL) {
    throw new EngineError(409, `当前状态（${run.status}）不能确认 G4 集成门禁`);
  }
  const checks = input.evidenceChecks;
  if (!checks.preflightAllPassed || !checks.pendingAllZeroed || !checks.handoffVersionAndHashRecorded || !checks.readNoMasterProduction) {
    throw new EngineError(409, '四项证据核对勾未全部勾选，G4 按钮不可点');
  }
  await ensureStepRows(runId, ['S20', 'S21']);
  const s17 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S17' } });
  const discovered = (safeParse(s17.evidence).discovered as { packagePath?: string; version?: string; hashBaseline?: string[] } | undefined);

  await prisma.$transaction(async (tx) => {
    const step = await tx.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S20' } });
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.DONE,
        startedAt: step.startedAt ?? new Date(),
        finishedAt: new Date(),
        evidence: JSON.stringify({
          ...safeParse(step.evidence),
          g4Approval: {
            by: userId,
            at: new Date().toISOString(),
            button: G4_INTEGRATION_APPROVAL_BUTTON,
            handoffPath: discovered?.packagePath ?? null,
            handoffVersion: discovered?.version ?? null,
            hashBaseline: discovered?.hashBaseline ?? [],
          },
        }),
      },
    });
    await tx.contentOpsApproval.create({
      data: {
        runId,
        gate: 'G4',
        stepCode: 'S20',
        buttonName: G4_INTEGRATION_APPROVAL_BUTTON,
        scope: '只授权应用集成、推送 main、部署/更新测试端；不授权推送 master 或部署生产。',
        checks: JSON.stringify({ evidenceChecks: checks, handoffPath: discovered?.packagePath ?? null }),
        status: 'approved',
        actorId: userId,
        lockedSha: discovered?.version ?? null,
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status === RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL) {
      await transitionRun(tx, fresh, RUN_STATE.RECONCILING_SNAPSHOTS, 'S20 G4 第一次人工门禁通过（解锁 S21 Trae 集成）');
    }
  });
  // S21 自动串联第一段：对账指令入队（Runner 心跳 CAS 抢占下发）
  await enqueueS21Phase(runId, 'reconcile', {
    handoffPath: discovered?.packagePath ?? null,
    handoffVersion: discovered?.version ?? null,
    hashBaseline: discovered?.hashBaseline ?? [],
  });
  await audit(userId, 'content_ops.g4_approve', runId, { handoffPath: discovered?.packagePath ?? null, version: discovered?.version ?? null });
  return { ok: true };
}

/** S20：G4 驳回 —— 回退到 final_handoff_preflight 重做预检 */
export async function rejectG4(userId: string, runId: string, input: { reason: string }) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const allowed: string[] = [RUN_STATE.AWAITING_STAGING_INTEGRATION_APPROVAL, RUN_STATE.RECONCILING_SNAPSHOTS];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能驳回 G4`);
  }
  if (!input.reason || input.reason.trim().length < 5) {
    throw new EngineError(400, '驳回原因不少于 5 字');
  }
  await prisma.$transaction(async (tx) => {
    const step = await tx.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S20' } });
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.FAILED,
        finishedAt: new Date(),
        failureReason: `G4 驳回：${input.reason.slice(0, 500)}`,
        evidence: JSON.stringify({ ...safeParse(step.evidence), g4Reject: { by: userId, at: new Date().toISOString(), reason: input.reason.slice(0, 500) } }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    await transitionRun(tx, fresh, RUN_STATE.FINAL_HANDOFF_PREFLIGHT, `G4 驳回：${input.reason.slice(0, 80)}`);
  });
  await audit(userId, 'content_ops.g4_reject', runId, { reason: input.reason.slice(0, 200) });
  return { ok: true };
}

// ------------------------------------------------------------------
// P4b：S21 Trae 集成（七段自动串联）+ S22 生产发布（G5 门禁 + 四段自动）
// 设计依据：用户确认方案（2026-10-08）
//   - S21 全自动：G4 通过 → reconcile → backup → integrate → activate_pilot → test → push_main → deploy_staging → AWAITING_STAGING_ACCEPTANCE
//     （activate_pilot：pilot 导师激活——prompt 资产落位 + 知识卡灌测试库；无 plan 的导师自动跳过）
//   - S22 G5 人工门禁 → lock_sha → promote → deploy_prod → verify → COMPLETED
//   - v1 过渡：deploy_staging = git push origin main（CloudBase 自动部署）；deploy_production = SSH ECS 执行部署脚本
//   - 每段指令在 S21/S22 同一 step 行上轮转（commandPayload 覆盖、idempotencyKey 轮换、evidence 累积阶段进度）
// ------------------------------------------------------------------

/** S21 activate_pilot 段：pilot 导师激活配置（mentorDirKey → 激活所需资产） */
const S21_ACTIVATE_PLAN: Record<string, { mentorId: string; cardsSource: string; promptSource: string | null }> = {
  'ying wang pilot': {
    mentorId: 'ying-pilot',
    cardsSource: 'content/knowledge-governance/current/ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl',
    promptSource: 'content/knowledge-governance/current/prompt-system/mentors/ying-pilot/persona.md',
  },
};

/** S21 七段指令类型映射 */
const S21_PHASE_COMMAND: Record<string, string> = {
  reconcile: COMMAND.GIT_FETCH_STATUS,
  backup: COMMAND.GIT_BACKUP_CREATE,
  integrate: COMMAND.GIT_INTEGRATE_HANDOFF,
  activate_pilot: COMMAND.ACTIVATE_MENTOR_STAGING,
  test: COMMAND.RUN_REGRESSION_TESTS,
  push_main: COMMAND.GIT_PUSH_MAIN,
  deploy_staging: COMMAND.DEPLOY_STAGING,
};

/** S21 下一段（reconcile → backup → ... → deploy_staging → null=完成） */
const S21_NEXT_PHASE: Record<string, string | null> = {
  reconcile: 'backup',
  backup: 'integrate',
  integrate: 'activate_pilot',
  activate_pilot: 'test',
  test: 'push_main',
  push_main: 'deploy_staging',
  deploy_staging: null,
};

/** S21 段完成后的 runState */
const S21_PHASE_RUNSTATE: Record<string, string> = {
  reconcile: RUN_STATE.INTEGRATION_BACKUP_CREATED,
  backup: RUN_STATE.INTEGRATING_APPLICATION,
  integrate: RUN_STATE.TESTING_STAGING,
  activate_pilot: RUN_STATE.TESTING_STAGING, // 激活属于测试准备，runState 与 integrate 段共用
  test: RUN_STATE.PUSHING_MAIN,
  push_main: RUN_STATE.DEPLOYING_STAGING,
  deploy_staging: RUN_STATE.AWAITING_STAGING_ACCEPTANCE,
};

/** S22 四段指令类型映射 */
const S22_PHASE_COMMAND: Record<string, string> = {
  lock_sha: COMMAND.GIT_PROMOTE_MAIN_TO_MASTER, // lock_sha 段 v1 合并进 promote（G5 通过直接推送 main:master）
  promote: COMMAND.GIT_PROMOTE_MAIN_TO_MASTER,
  deploy_prod: COMMAND.DEPLOY_PRODUCTION,
  verify: COMMAND.GIT_FETCH_STATUS, // verify 段复用 fetch status 检查生产
};

const S22_NEXT_PHASE: Record<string, string | null> = {
  lock_sha: 'promote',
  promote: 'deploy_prod',
  deploy_prod: 'verify',
  verify: null,
};

const S22_PHASE_RUNSTATE: Record<string, string> = {
  lock_sha: RUN_STATE.PROMOTING_MAIN_TO_MASTER,
  promote: RUN_STATE.DEPLOYING_PRODUCTION,
  deploy_prod: RUN_STATE.VERIFYING_PRODUCTION,
  verify: RUN_STATE.COMPLETED,
};

/** S21 段指令入队（G4 通过后首段 + 每段结果回调里续段） */
async function enqueueS21Phase(
  runId: string,
  phase: string,
  context: { handoffPath: string | null; handoffVersion: string | null; hashBaseline: string[]; targetAppPaths?: string[] },
) {
  const type = S21_PHASE_COMMAND[phase];
  if (!type) throw new EngineError(400, `S21 未知段：${phase}`);
  // activate_pilot 段按 run 的 mentorDir 注入激活配置；无配置的导师注入 skipped 标记，Runner 原样跳过续段
  let activatePlan: Record<string, unknown> | null = null;
  if (phase === 'activate_pilot') {
    const run = await prisma.contentOpsRun.findUniqueOrThrow({
      where: { id: runId },
      select: { mentorDir: true },
    });
    const plan = S21_ACTIVATE_PLAN[normalizeMentorDirKey(run.mentorDir)] ?? null;
    activatePlan = plan ? { ...plan } : { skipped: true };
  }
  const updated = await prisma.contentOpsStep.updateMany({
    where: { runId, code: 'S21', commandStatus: { in: ['none', 'failed', 'done', 'dispatched'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type, payload: { phase, ...(activatePlan ? { activatePlan } : {}), ...context } }),
      idempotencyKey: `${runId}:S21:${phase}:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) {
    throw new EngineError(409, `S21 ${phase} 段指令无法入队（commandStatus 非空闲）`);
  }
}

/** S22 段指令入队（G5 通过后首段 + 每段结果回调里续段） */
async function enqueueS22Phase(runId: string, phase: string, context: { lockedMainSha?: string | null }) {
  const type = S22_PHASE_COMMAND[phase];
  if (!type) throw new EngineError(400, `S22 未知段：${phase}`);
  const updated = await prisma.contentOpsStep.updateMany({
    where: { runId, code: 'S22', commandStatus: { in: ['none', 'failed', 'done', 'dispatched'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type, payload: { phase, ...context } }),
      idempotencyKey: `${runId}:S22:${phase}:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  if (updated.count === 0) {
    throw new EngineError(409, `S22 ${phase} 段指令无法入队（commandStatus 非空闲）`);
  }
}

/** S21 段结果处理：记录阶段进度、推进 runState、续段或收尾 */
async function handleS21PhaseResult(
  step: { id: string; runId: string; evidence: string | null; run: { id: string; status: string } },
  payload: { payload: { phase?: string; handoffPath?: string | null; handoffVersion?: string | null; hashBaseline?: string[]; targetAppPaths?: string[] } },
  result: Record<string, unknown>,
) {
  const phase = payload.payload.phase ?? 'reconcile';
  const ev = safeParse(step.evidence);
  const progress = (ev.s21Progress as Record<string, unknown> | undefined) ?? {};
  progress[phase] = { ok: true, at: new Date().toISOString(), summary: summarizeS21Result(phase, result) };
  ev.s21Progress = progress;
  ev.handoffPath = payload.payload.handoffPath ?? ev.handoffPath ?? null;
  ev.handoffVersion = payload.payload.handoffVersion ?? ev.handoffVersion ?? null;

  const next = S21_NEXT_PHASE[phase] ?? null;
  const targetState = S21_PHASE_RUNSTATE[phase];

  await prisma.$transaction(async (tx) => {
    if (next === null) {
      // S21 最后一段（deploy_staging）完成：步骤 done，run 进入 AWAITING_STAGING_ACCEPTANCE
    await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify(result),
          status: STEP_STATUS.DONE,
          finishedAt: new Date(),
          evidence: JSON.stringify(ev),
        },
      });
    } else {
      // 中间段：记录结果但保持 running，准备续段
    await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify(result),
          evidence: JSON.stringify(ev),
        },
      });
    }
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
    if (fresh.status !== targetState && fresh.status !== 'failed') {
      await transitionRun(tx, fresh, targetState, `S21 ${phase} 段完成`);
    }
  });

  // 续段（事务外入队，避免嵌套事务超时）
  if (next !== null) {
    await enqueueS21Phase(step.runId, next, {
      handoffPath: (ev.handoffPath as string | null) ?? null,
      handoffVersion: (ev.handoffVersion as string | null) ?? null,
      hashBaseline: (Array.isArray(ev.hashBaseline) ? ev.hashBaseline : []) as string[],
      targetAppPaths: (Array.isArray(ev.targetAppPaths) ? ev.targetAppPaths : []) as string[],
    });
  }
}

/** S22 段结果处理 */
async function handleS22PhaseResult(
  step: { id: string; runId: string; evidence: string | null; run: { id: string; status: string } },
  payload: { payload: { phase?: string; lockedMainSha?: string | null } },
  result: Record<string, unknown>,
) {
  const phase = payload.payload.phase ?? 'promote';
  const ev = safeParse(step.evidence);
  const progress = (ev.s22Progress as Record<string, unknown> | undefined) ?? {};
  progress[phase] = { ok: true, at: new Date().toISOString(), summary: summarizeS22Result(phase, result) };
  ev.s22Progress = progress;
  if (result.mainSha) ev.lockedMainSha = String(result.mainSha);

  const next = S22_NEXT_PHASE[phase] ?? null;
  const targetState = S22_PHASE_RUNSTATE[phase];

  await prisma.$transaction(async (tx) => {
    if (next === null) {
    await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify(result),
          status: STEP_STATUS.DONE,
          finishedAt: new Date(),
          evidence: JSON.stringify(ev),
        },
      });
    } else {
    await tx.contentOpsStep.update({
        where: { id: step.id },
        data: {
          commandStatus: 'done',
          commandResult: JSON.stringify(result),
          evidence: JSON.stringify(ev),
        },
      });
    }
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: step.runId } });
    if (fresh.status !== targetState && fresh.status !== 'failed') {
      await transitionRun(tx, fresh, targetState, `S22 ${phase} 段完成`);
    }
  });

  if (next !== null) {
    await enqueueS22Phase(step.runId, next, { lockedMainSha: (ev.lockedMainSha as string | null) ?? null });
  }
}

function summarizeS21Result(phase: string, result: Record<string, unknown>): unknown {
  switch (phase) {
    case 'reconcile': return { matched: result.matched, mismatched: result.mismatched, beforeSha: result.beforeSha };
    case 'backup': return { backupDir: result.backupDir, beforeSha: result.beforeSha };
    case 'integrate': return { copiedFiles: result.copiedFiles, targetPaths: result.targetPaths };
    case 'test': return { passed: result.passed, failed: result.failed, details: result.details };
    case 'activate_pilot': return { skipped: result.skipped, mentorId: result.mentorId, promptCopied: result.promptCopied, seeded: result.seeded, total: result.total };
    case 'push_main': return { mainSha: result.mainSha, pushed: result.pushed };
    case 'deploy_staging': return { autoDeployed: result.autoDeployed, note: result.note };
    default: return { keys: Object.keys(result) };
  }
}

function summarizeS22Result(phase: string, result: Record<string, unknown>): unknown {
  switch (phase) {
    case 'lock_sha': return { mainSha: result.mainSha };
    case 'promote': return { masterSha: result.masterSha, pushed: result.pushed };
    case 'deploy_prod': return { deployOk: result.deployOk, scriptLog: result.scriptLog };
    case 'verify': return { productionOk: result.productionOk, httpStatus: result.httpStatus };
    default: return { keys: Object.keys(result) };
  }
}

/** S22：G5 第二次人工门禁 —— 测试端验收通过并发布生产 */
export async function requestG5Approval(
  userId: string,
  runId: string,
  input: { evidenceChecks: { stagingAcceptancePassed: boolean; readProductionImpact: boolean; mainShaLocked: boolean; readRollbackPlan: boolean } },
) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== RUN_STATE.AWAITING_STAGING_ACCEPTANCE) {
    throw new EngineError(409, `当前状态（${run.status}）不能确认 G5 生产发布门禁`);
  }
  const checks = input.evidenceChecks;
  if (!checks.stagingAcceptancePassed || !checks.readProductionImpact || !checks.mainShaLocked || !checks.readRollbackPlan) {
    throw new EngineError(409, '四项证据核对勾未全部勾选，G5 按钮不可点');
  }
  await ensureStepRows(runId, ['S22']);
  const s21 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S21' } });
  const s21Ev = safeParse(s21.evidence);
  const lockedMainSha = (s21Ev.s21Progress as { push_main?: { summary?: { mainSha?: string } } } | undefined)?.push_main?.summary?.mainSha ?? null;

  await prisma.$transaction(async (tx) => {
    const step = await tx.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S22' } });
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.RUNNING,
        startedAt: step.startedAt ?? new Date(),
        evidence: JSON.stringify({
          ...safeParse(step.evidence),
          g5Approval: {
            by: userId,
            at: new Date().toISOString(),
            button: G5_PRODUCTION_APPROVAL_BUTTON,
            lockedMainSha,
          },
        }),
      },
    });
    await tx.contentOpsApproval.create({
      data: {
        runId,
        gate: 'G5',
        stepCode: 'S22',
        buttonName: G5_PRODUCTION_APPROVAL_BUTTON,
        scope: '授权锁定 main SHA、推送 main→master、部署生产 ECS（aihr.top）并执行线上验证。',
        checks: JSON.stringify({ evidenceChecks: checks, lockedMainSha }),
        status: 'approved',
        actorId: userId,
        lockedSha: lockedMainSha,
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (fresh.status === RUN_STATE.AWAITING_STAGING_ACCEPTANCE) {
      await transitionRun(tx, fresh, RUN_STATE.PRODUCTION_APPROVAL_GRANTED, 'S22 G5 第二次人工门禁通过（解锁生产发布）');
    }
  });
  // S22 自动串联第一段：lock_sha（v1 直接进 promote，推送 main:master）
  await enqueueS22Phase(runId, 'promote', { lockedMainSha });
  await audit(userId, 'content_ops.g5_approve', runId, { lockedMainSha });
  return { ok: true };
}

/** S22：G5 驳回 —— 回退到 AWAITING_STAGING_ACCEPTANCE（要求重做测试端验收）或回滚 */
export async function rejectG5(userId: string, runId: string, input: { reason: string }) {
  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  const allowed: string[] = [RUN_STATE.AWAITING_STAGING_ACCEPTANCE, RUN_STATE.PRODUCTION_APPROVAL_GRANTED, RUN_STATE.PROMOTING_MAIN_TO_MASTER, RUN_STATE.DEPLOYING_PRODUCTION, RUN_STATE.VERIFYING_PRODUCTION, RUN_STATE.PRODUCTION_FAILED_ROLLED_BACK];
  if (!allowed.includes(run.status)) {
    throw new EngineError(409, `当前状态（${run.status}）不能驳回 G5`);
  }
  if (!input.reason || input.reason.trim().length < 5) {
    throw new EngineError(400, '驳回原因不少于 5 字');
  }
  await prisma.$transaction(async (tx) => {
    const step = await tx.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S22' } });
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        status: STEP_STATUS.FAILED,
        finishedAt: new Date(),
        failureReason: `G5 驳回：${input.reason.slice(0, 500)}`,
        evidence: JSON.stringify({ ...safeParse(step.evidence), g5Reject: { by: userId, at: new Date().toISOString(), reason: input.reason.slice(0, 500) } }),
      },
    });
    const fresh = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    await transitionRun(tx, fresh, RUN_STATE.PRODUCTION_FAILED_ROLLED_BACK, `G5 驳回：${input.reason.slice(0, 80)}`);
  });
  await audit(userId, 'content_ops.g5_reject', runId, { reason: input.reason.slice(0, 200) });
  return { ok: true };
}

// ------------------------------------------------------------------
// 失败重试：把 failed 指令重新入队（保留失败历史于事件流）
// ------------------------------------------------------------------

export async function retryCommand(userId: string, runId: string, stepCode: string) {
  const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: stepCode } });
  if (step.commandStatus !== 'failed') {
    throw new EngineError(409, `步骤 ${stepCode} 指令未失败，无需重试`);
  }
  if (!step.commandPayload) throw new EngineError(409, '该步骤没有可重试的指令');
  const payload = JSON.parse(step.commandPayload) as { type: string };
  await prisma.$transaction(async (tx) => {
    await tx.contentOpsStep.update({
      where: { id: step.id },
      data: {
        commandStatus: 'queued',
        status: STEP_STATUS.RUNNING,
        failureReason: null,
        dispatchedAt: null,
      },
    });
    const run = await tx.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status === 'failed') {
      // 从失败干预态回到该步语义对应的活跃主线状态（由步骤定义推导）
      const recovery = step.code === 'S3' ? RUN_STATE.ROUND1_ARCHIVED
        : step.code === 'S17' ? RUN_STATE.FINAL_HANDOFF_DISCOVERED
        : run.status;
      if (recovery !== run.status) {
        await transitionRun(tx, run, recovery, 'manual retry');
      }
    }
  });
  await audit(userId, 'content_ops.command_retry', runId, { step: stepCode, command: payload.type });
  return { queued: true };
}
