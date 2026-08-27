/** Winnie 第一轮内部评测 CLI。 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { runEvalBatch } from '../src/lib/eval-core';
import { WINNIE_EVAL_V1 } from '../src/lib/winnie-eval-v1';

for (const file of ['.env', '.env.local']) {
  const filePath = resolve(process.cwd(), file);
  if (!existsSync(filePath)) continue;
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let questions = WINNIE_EVAL_V1;
  let scope = 'winnie-r1-full';

  if (args.includes('--limit')) {
    const index = args.indexOf('--limit');
    const limit = Number.parseInt(args[index + 1] || '20', 10);
    questions = WINNIE_EVAL_V1.slice(0, limit);
    scope = `winnie-r1-limit${limit}`;
  }

  console.log(`开始评测：mentor=winnie，scope=${scope}，题数=${questions.length}`);
  const summary = await runEvalBatch({
    mentorId: 'winnie',
    questions,
    scope,
    concurrency: 3,
    testMode: true,
  });

  console.log('\n========== Winnie 评测完成 ==========');
  console.log(`run id: ${summary.runId}`);
  console.log(`完成: ${summary.completed}/${summary.total}`);
  console.log(`通过: ${summary.passed}`);
  console.log(`硬伤: ${summary.hardFail}`);
  console.log(`平均分: ${summary.avgScore.toFixed(2)}`);
  console.log(`累计 token: ${summary.totalTokens}`);
}

main().catch((error) => {
  console.error('Winnie 评测失败：', error);
  process.exit(1);
});
