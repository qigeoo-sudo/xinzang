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
import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import {
  ACTOR,
  P1_ACTIVE_CODES,
  RUN_STATE,
  STEP_DEFS,
  STEP_STATUS,
  canTransition,
  getStepDef,
  mentorDirStatus,
  normalizeMentorDirKey,
  nextStepCode,
} from './state-machine';
import { evaluateVpnHint, type VpnSnapshot } from './vpn-policy';

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
  CODEX_PROBE: 'codex_probe',
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

  // waiting_runner 自动接上（Q14）
  const waiting = await prisma.contentOpsRun.findMany({
    where: { runnerId, status: RUN_STATE.WAITING_RUNNER },
  });
  for (const run of waiting) {
    await prisma.$transaction(async (tx) => {
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
      await handleScanResult(step, result, runnerId);
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
  return { keys: Object.keys(result) };
}

async function handleHashFilesResult(
  step: { id: string; runId: string; code: string; evidence: string | null; run: { id: string; status: string } },
  payload: { payload: { files?: Array<{ relPath: string; kind: string; sourceType: string; note?: string }> } },
  result: Record<string, unknown>,
) {
  const rows = (result.results ?? []) as Array<{
    path: string;
    displayPath?: string;
    sha256?: string;
    bytes?: string;
    ok: boolean;
    reason?: string;
  }>;
  const failed = rows.filter((r) => !r.ok);
  if (failed.length > 0) {
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
      const existing = await tx.contentOpsArtifact.findUnique({
        where: { runId_path: { runId: step.runId, path: row.path } },
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
          path: row.path,
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
  const paths = [`${contentRoot}\\${relStartHere.replace(/\//g, '\\')}`];
  // 链式指令：scan 刚回报（commandStatus=dispatched），同一步骤重新置 queued 下发 START_HERE 哈希
  // 兼容已落 done 的场景；queued/done(hash) 不匹配，天然防重复入队
  const updated = await prisma.contentOpsStep.updateMany({
    where: { id: step.id, commandStatus: { in: ['dispatched', 'done'] } },
    data: {
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.HASH_FILES, payload: { files, paths } }),
      evidence: JSON.stringify({ packages, chosenPackage: chosen, policy: 'name_sort_last_p1' }),
    },
  });
  if (updated.count === 0) {
    throw new EngineError(409, 'S7 链式核验入队失败（指令状态异常）');
  }
  void runnerId;
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
  const paths = files.map((f) => `${contentRoot}\\${f.relPath.replace(/\//g, '\\')}`);
  await prisma.contentOpsStep.updateMany({
    where: { runId, code: stepCode, commandStatus: { in: ['none', 'failed'] } },
    data: {
      status: STEP_STATUS.RUNNING,
      startedAt: new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type: COMMAND.HASH_FILES, payload: { files, paths } }),
      failureReason: null,
    },
  });
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
    for (const def of STEP_DEFS.filter((d) => P1_ACTIVE_CODES.includes(d.code))) {
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
  const ordered = STEP_DEFS.filter((d) => P1_ACTIVE_CODES.includes(d.code)).map((d) => {
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
      failureReason: null,
    },
  });
  await audit(userId, 'content_ops.verify_assembly', runId, {});
  return { queued: true };
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
      const recovery = step.code === 'S3' ? RUN_STATE.ROUND1_ARCHIVED : run.status;
      if (recovery !== run.status) {
        await transitionRun(tx, run, recovery, 'manual retry');
      }
    }
  });
  await audit(userId, 'content_ops.command_retry', runId, { step: stepCode, command: payload.type });
  return { queued: true };
}
