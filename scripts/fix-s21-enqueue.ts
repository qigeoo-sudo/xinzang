/**
 * 一次性修复脚本：给 S21 step 入队指定段指令（默认 reconcile）。
 * --reset 失败状态后入队；用于 integrate 段路径 bug 修复后重跑。
 * 用法：
 *   npx tsx scripts/fix-s21-enqueue.ts <runId> [reconcile|backup|integrate|test|push_main|deploy_staging] [--reset]
 */
import { PrismaClient } from '../src/generated/prisma';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const S21_PHASE_COMMAND: Record<string, string> = {
  reconcile: 'git_fetch_status',
  backup: 'git_backup_create',
  integrate: 'git_integrate_handoff',
  test: 'run_regression_tests',
  push_main: 'git_push_main',
  deploy_staging: 'deploy_staging',
};
const S21_PHASE_RUNSTATE: Record<string, string> = {
  reconcile: 'reconciling_snapshots',
  backup: 'integration_backup_created',
  integrate: 'integrating_application',
  test: 'testing_staging',
  push_main: 'pushing_main',
  deploy_staging: 'deploying_staging',
};

async function main() {
  const runId = process.argv[2];
  const phase = process.argv[3] ?? 'reconcile';
  const doReset = process.argv.includes('--reset');
  if (!runId) {
    console.error('用法：npx tsx scripts/fix-s21-enqueue.ts <runId> [phase] [--reset]');
    process.exit(1);
  }
  const type = S21_PHASE_COMMAND[phase];
  if (!type) {
    console.error('未知段：', phase);
    process.exit(1);
  }

  const run = await prisma.contentOpsRun.findUniqueOrThrow({ where: { id: runId } });
  console.log('run.status=', run.status, 'mentorDir=', run.mentorDir, 'phase=', phase, 'reset=', doReset);

  // 查 S17 evidence 取 discovered
  const s17 = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId, code: 'S17' } });
  const ev = JSON.parse(s17.evidence || '{}');
  const discovered = (ev.discovered as { packagePath?: string; version?: string; hashBaseline?: string[] } | undefined) ?? {};
  const handoffPath = discovered.packagePath ?? null;
  const handoffVersion = discovered.version ?? null;
  const hashBaseline = discovered.hashBaseline ?? [];

  // ensure S21 step 存在
  let s21 = await prisma.contentOpsStep.findFirst({ where: { runId, code: 'S21' } });
  if (!s21) {
    s21 = await prisma.contentOpsStep.create({
      data: {
        runId,
        code: 'S21',
        actor: 'trae',
        title: 'Trae 集成：对账→备份→集成→八类测试→推main→部署测试端',
        status: 'pending',
        idempotencyKey: `${runId}:S21:init:${randomBytes(4).toString('hex')}`,
      },
    });
    console.log('已创建 S21 step id=', s21.id);
  } else {
    console.log('S21 step id=', s21.id, 'commandStatus=', s21.commandStatus, 'status=', s21.status);
  }

  // --reset：把 run 和 S21 step 从 failed 重置，允许重新入队
  if (doReset) {
    const r1 = await prisma.contentOpsRun.update({
      where: { id: runId },
      data: { status: S21_PHASE_RUNSTATE[phase] },
    });
    console.log('run 重置为', r1.status);
    const r2 = await prisma.contentOpsStep.update({
      where: { id: s21.id },
      data: {
        status: 'running',
        commandStatus: 'none',
        failureReason: null,
        commandResult: null,
      },
    });
    console.log('S21 step 重置 commandStatus=', r2.commandStatus);
  }

  // 入队
  const updated = await prisma.contentOpsStep.updateMany({
    where: { runId, code: 'S21', commandStatus: { in: ['none', 'failed', 'done', 'dispatched'] } },
    data: {
      status: 'running',
      startedAt: new Date(),
      commandStatus: 'queued',
      commandPayload: JSON.stringify({ type, payload: { phase, handoffPath, handoffVersion, hashBaseline } }),
      idempotencyKey: `${runId}:S21:${phase}:${randomBytes(6).toString('hex')}`,
      failureReason: null,
    },
  });
  console.log(phase, '入队 updated.count=', updated.count);
  if (updated.count === 0) {
    console.error('入队失败：S21 commandStatus 非空闲，需人工排查');
    process.exit(1);
  }
  console.log('完成：Runner 下次心跳将抢占', phase, '指令');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
