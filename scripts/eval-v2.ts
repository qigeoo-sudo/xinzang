/**
 * 批量评测 CLI — 新架构 (v2)
 *
 * 用法:
 *   npx tsx scripts/eval-v2.ts            # 跑全部 100 题
 *   npx tsx scripts/eval-v2.ts --limit 30 # 跑前 30 题
 *
 * 与 /api/eval/batch 共用 src/lib/eval-core.ts 引擎。
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runEvalBatch } from '../src/lib/eval-core';
import { LYDIA_EVAL_V2 } from '../src/lib/lydia-eval-v2';

// tsx 不自动加载 .env，手动加载
for (const file of ['.env', '.env.local']) {
  const p = resolve(process.cwd(), file);
  let raw: string;
  try {
    raw = readFileSync(p, 'utf-8');
  } catch {
    continue;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let questions = LYDIA_EVAL_V2;
  let scope = 'baseline-v2';

  if (args.includes('--limit')) {
    const idx = args.indexOf('--limit');
    const n = parseInt(args[idx + 1] || '30', 10);
    questions = LYDIA_EVAL_V2.slice(0, n);
    scope = `limit${n}`;
  }

  console.log(`开始评测(新架构): mentor=lydia, scope=${scope}, 题数=${questions.length}`);

  const summary = await runEvalBatch({
    mentorId: 'lydia',
    questions,
    scope,
    concurrency: 3,
    testMode: true,
  });

  console.log('\n========== 评测完成 ==========');
  console.log(`run id: ${summary.runId}`);
  console.log(`完成: ${summary.completed}/${summary.total}`);
  console.log(`通过(>=3分且无硬伤): ${summary.passed}`);
  console.log(`硬伤(hard_fail): ${summary.hardFail}`);
  console.log(`平均分: ${summary.avgScore.toFixed(2)}`);
  console.log(`累计 token: ${summary.totalTokens}`);
  console.log('\n注意: 本结果仅作内部测试记录，不代表正式质量结论。');
}

main().catch((e) => {
  console.error('❌ 评测脚本失败:', e);
  process.exit(1);
});
