/**
 * 一次性 retrofit：为已完成六段 S21 的 run 补跑 activate_pilot 段（七段改造后补做激活）。
 * 用法：npx tsx scripts/retrofit-activate-pilot.ts
 * 完成后删除本文件。
 */
import { PrismaClient } from '../src/generated/prisma';

const RUN_ID = 'cmuxfaf41008ulg26qzoo8q7v';
// --phase activate_pilot（默认，重跑激活段）| --phase test（激活已实际完成，直接续测试段）
const phaseIdx = process.argv.indexOf('--phase');
const PHASE = phaseIdx !== -1 ? process.argv[phaseIdx + 1] : 'activate_pilot';

const prisma = new PrismaClient();

async function main() {
const run = await prisma.contentOpsRun.findUniqueOrThrow({
  where: { id: RUN_ID },
  select: { id: true, status: true, mentorDir: true },
});
console.log(`run=${run.id} mentorDir="${run.mentorDir}" status=${run.status}`);

const requeueOnly = run.status === 'testing_staging';
if (!['awaiting_staging_acceptance', 'testing_staging', 'failed'].includes(run.status)) {
  console.error(`✗ run 状态为 ${run.status}（预期 awaiting_staging_acceptance / testing_staging / failed 重入队），中止`);
  process.exit(1);
}

const step = await prisma.contentOpsStep.findFirstOrThrow({ where: { runId: RUN_ID, code: 'S21' } });
const ev = JSON.parse(step.evidence ?? '{}') as Record<string, unknown>;
const progress = (ev.s21Progress ?? {}) as Record<string, unknown>;
// 清掉将重跑的段进度（activate_pilot 本就无进度），让面板当前段指针指向 activate_pilot
delete progress.test;
delete progress.push_main;
delete progress.deploy_staging;
ev.s21Progress = progress;

const RETROFIT_NO = requeueOnly ? 2 : 1;

await prisma.$transaction([
  ...(requeueOnly
    ? []
    : [prisma.contentOpsRun.update({
        where: { id: RUN_ID },
        data: { status: 'testing_staging' },
      })]),
  prisma.contentOpsStep.update({
    where: { id: step.id },
    data: {
      status: 'running',
      commandStatus: 'queued',
      startedAt: new Date(),
      commandPayload: JSON.stringify({
        type: PHASE === 'test' ? 'run_regression_tests' : 'activate_mentor_staging',
        payload: {
          phase: PHASE,
          ...(PHASE === 'activate_pilot'
            ? {
                activatePlan: {
                  mentorId: 'ying-pilot',
                  cardsSource: 'content/knowledge-governance/current/ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl',
                  promptSource: 'content/knowledge-governance/current/prompt-system/mentors/ying-pilot/persona.md',
                },
              }
            : {}),
        },
      }),
      idempotencyKey: `${RUN_ID}:S21:${PHASE}:retrofit${RETROFIT_NO}`,
      evidence: JSON.stringify(ev),
      failureReason: null,
    },
  }),
]);

console.log(`✓ 已置回 testing_staging 并入队 ${PHASE} 段（Runner 心跳将抢跑，后续自动续段）`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
