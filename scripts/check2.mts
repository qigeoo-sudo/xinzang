import { PrismaClient } from '../src/generated/prisma';

const p = new PrismaClient();
const run = await p.contentOpsRun.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, status: true } });
const s13 = await p.contentOpsStep.findFirst({
  where: { runId: run!.id, code: 'S13' },
  select: { status: true, commandStatus: true, failureReason: true, evidence: true, updatedAt: true },
});
console.log('run:', run!.status, '| S13:', s13?.status, s13?.commandStatus, 'updatedAt:', s13?.updatedAt);
console.log('fail:', s13?.failureReason?.slice(0, 120) ?? '(none)');
const ev = JSON.parse(s13?.evidence ?? '{}');
console.log('scannedAt:', ev.materialScan?.scannedAt, '| skipped:', JSON.stringify(ev.materialScan?.skipped));
console.log('groups:', (ev.materialScan?.groups ?? []).map((g: { id: string }) => g.id).join(','));
await p.$disconnect();
