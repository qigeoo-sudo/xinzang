/**
 * Runner Codex 链路 smoke 测试（不接触真实导师资产）。
 *
 * 验证条件（全部满足才算 PASS）：
 * 1. 目标文件实际存在
 * 2. 内容 SHA-256 与源文件一致
 * 3. JSONL trace 中出现 command 或 file_change 事件
 * 4. codex 退出码为 0
 * 5. 最终回复明确给出目标路径
 *
 * 测试目录：D:\database\_runner-smoke\
 *   source\sample.txt   —— 源文件
 *   target\             —— 目标目录（codex 写入）
 */
import { mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { deliverTrigger, sha256File } from './runner/src/codex.mjs';

const BASE = 'D:\\database\\_runner-smoke';
const SOURCE_DIR = path.join(BASE, 'source');
const TARGET_DIR = path.join(BASE, 'target');
const SOURCE_FILE = path.join(SOURCE_DIR, 'sample.txt');
const TARGET_FILE = path.join(TARGET_DIR, 'sample.txt');

const SAMPLE_CONTENT = `Runner Codex smoke test sample.
Timestamp: ${new Date().toISOString()}
Line 3: verification payload.
`;

async function setup() {
  await mkdir(SOURCE_DIR, { recursive: true });
  await mkdir(TARGET_DIR, { recursive: true });
  await writeFile(SOURCE_FILE, SAMPLE_CONTENT, 'utf8');
  // 清理可能存在的旧目标文件
  try { await unlink(TARGET_FILE); } catch { /* ignore */ }
}

async function main() {
  console.log('=== Runner Codex Smoke Test ===');
  console.log(`Base: ${BASE}`);

  await setup();
  const sourceHash = await sha256File(SOURCE_FILE);
  console.log(`Source SHA-256: ${sourceHash}`);

  const trigger = [
    '这是 Runner Codex 链路的 smoke 测试，不涉及任何真实导师资产。',
    '请执行以下操作：',
    `1. 读取文件 ${SOURCE_FILE}`,
    `2. 将其内容原样复制到 ${TARGET_FILE}（目录已存在，直接写入即可）`,
    `3. 读取目标文件并计算其 SHA-256 哈希`,
    '4. 在最终回复中明确给出：目标文件的完整路径、目标文件的 SHA-256 哈希值。',
    '不要分析内容，不要创建额外文件，只需复制并返回哈希。',
  ].join('\n');

  const startedAt = Date.now();
  const result = await deliverTrigger({
    baseDir: 'D:\\database',
    trigger,
    taskType: 'smoke',
  });
  const elapsedMs = Date.now() - startedAt;

  console.log(`\n--- Codex 执行结果 (${elapsedMs}ms) ---`);
  console.log('ok:', result.ok);
  console.log('exitCode:', result.exitCode);
  console.log('threadId:', result.threadId);
  console.log('tracePath:', result.tracePath);
  console.log('lastMessagePath:', result.lastMessagePath);
  if (result.reason) console.log('reason:', result.reason);
  if (result.output) console.log('output:', result.output.slice(0, 500));
  console.log('publicEvents count:', result.events?.length ?? 0);

  // ---- 验证 ----
  const checks = [];

  // 1. 目标文件存在
  let targetExists = false;
  try {
    const s = await stat(TARGET_FILE);
    targetExists = s.isFile();
  } catch { targetExists = false; }
  checks.push({ name: '目标文件存在', pass: targetExists });

  // 2. SHA-256 一致
  let hashMatch = false;
  let targetHash = null;
  if (targetExists) {
    targetHash = await sha256File(TARGET_FILE);
    hashMatch = targetHash === sourceHash;
  }
  checks.push({ name: `SHA-256 一致 (source=${sourceHash.slice(0, 16)}..., target=${targetHash ? targetHash.slice(0, 16) + '...' : 'N/A'})`, pass: hashMatch });

  // 3. JSONL 中有 command 或 file_change 事件
  const hasOpEvent = (result.events || []).some((e) =>
    e.type === 'command' || e.type === 'command_started' || e.type === 'command_completed' ||
    e.type === 'file_change' || e.type === 'tool_call_completed',
  );
  checks.push({ name: 'JSONL 含 command/file_change/tool_call 事件', pass: hasOpEvent });

  // 4. 退出码 0
  checks.push({ name: `退出码为 0 (实际=${result.exitCode})`, pass: result.exitCode === 0 });

  // 5. 最终回复含目标路径
  const output = result.output || '';
  const mentionsTarget = output.includes(TARGET_FILE) || output.includes('_runner-smoke');
  checks.push({ name: '最终回复提及目标路径', pass: mentionsTarget });

  // ---- 输出报告 ----
  console.log('\n=== 验证报告 ===');
  let allPass = true;
  for (const c of checks) {
    console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
    if (!c.pass) allPass = false;
  }
  console.log(`\n总体: ${allPass ? 'PASS' : 'FAIL'}`);

  // 保存报告
  const report = {
    timestamp: new Date().toISOString(),
    elapsedMs,
    sourceFile: SOURCE_FILE,
    targetFile: TARGET_FILE,
    sourceHash,
    targetHash,
    checks,
    allPass,
    codex: {
      ok: result.ok,
      exitCode: result.exitCode,
      threadId: result.threadId,
      tracePath: result.tracePath,
      lastMessagePath: result.lastMessagePath,
      reason: result.reason || null,
      outputPreview: output.slice(0, 1000),
      publicEvents: result.events || [],
    },
  };
  const reportPath = path.join(BASE, 'smoke-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n报告已保存: ${reportPath}`);
  console.log(`JSONL trace: ${result.tracePath}`);

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(2);
});
