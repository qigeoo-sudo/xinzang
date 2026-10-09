/**
 * Codex CLI 能力探测与非交互驱动。
 *
 * 执行约定（2026-10-10 修复 Runner 超时根因）：
 * - 直接根因：Node spawn 创建了 stdin 管道但从未关闭，Codex CLI 一直等待额外 stdin 输入。
 *   修复：prompt 走 stdin 并立即 child.stdin.end(trigger, 'utf8') 发送 EOF。
 * - 工作根目录统一为 CONTENT_ROOT（D:\database），不用目标导师子目录作为 -C。
 * - --sandbox workspace-write + --approve-for-me 授权写权限，不使用 --dangerously-bypass-*。
 * - stdout 按行实时消费 JSONL，写入脱敏 trace 文件；每收到事件重置无活动超时。
 * - --output-last-message <file> 单独保存最终回复，避免 JSONL 事件结构变化丢文本。
 * - 非零退出码一律判定失败（删除"有 threadId 即成功"的旧逻辑）。
 * - CI=true 仅作为非交互环境标识保留，不描述为文件执行能力的关键条件。
 */
import { spawn, execFile } from 'node:child_process';
import { readdir, stat, mkdir, appendFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export const CODEX_DELIVER_STATUS = 'ready';

const VERSION_TIMEOUT_MS = 15_000;

/** 任务类型 → 总任务上限（毫秒）。smoke 120s；完整 Assembly 允许长任务。 */
const TASK_TIMEOUTS = {
  smoke: 120_000,
  assembly_round1: 30 * 60_000,   // 30 分钟
  assembly_round2: 30 * 60_000,
  default: 30 * 60_000,
};

/** 无活动超时：收到任何 JSONL 事件后重新计时 */
const IDLE_TIMEOUT_MS = 120_000;

/** 对单个 CLI 路径跑 --version；shell 仅在裸命令名（依赖 PATH 解析 .cmd shim）时开启 */
function runVersion(cli, timeoutMs = VERSION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = spawn(cli, ['--version'], {
      shell: cli === 'codex',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* ignore */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ installed: false, version: null, reason: 'timeout' }), timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      finish({ installed: false, version: null, reason: err.code === 'ENOENT' ? 'not_found' : err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        finish({ installed: true, version: stdout.trim(), reason: null });
      } else {
        finish({ installed: false, version: null, reason: `exit_${code}`, stderr: stderr.slice(0, 200) });
      }
    });
  });
}

/** 桌面版默认安装区：bin/<随机构建号>/codex.exe，取修改时间最新的构建（每次探测动态发现，不写死） */
async function desktopNativeCandidates() {
  if (process.platform !== 'win32') return [];
  const base = path.join(os.homedir(), 'AppData', 'Local', 'OpenAI', 'Codex', 'bin');
  const out = [];
  let builds;
  try { builds = await readdir(base, { withFileTypes: true }); } catch { return out; }
  const hits = [];
  for (const b of builds) {
    if (!b.isDirectory()) continue;
    const exe = path.join(base, b.name, 'codex.exe');
    try {
      const s = await stat(exe);
      if (s.isFile()) hits.push({ exe, mtimeMs: s.mtimeMs });
    } catch { /* 构建目录内无 codex.exe，跳过 */ }
  }
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  out.push(...hits.map((h) => h.exe));
  return out;
}

/** where.exe 动态发现 PATH 上的 codex.exe */
function whereCodexExe() {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile('where.exe', ['codex.exe'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(
        String(stdout)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    });
  });
}

function classifySource(cli) {
  const lower = String(cli).toLowerCase();
  if (lower.includes('openai') && lower.includes('codex')) return 'desktop_native';
  if (lower.includes('node')) return 'npm_shim';
  return cli === 'codex' ? 'npm_shim' : 'path';
}

/**
 * 探测本机 Codex CLI：桌面原生 codex.exe 优先（版本与桌面端缓存一致），npm shim 兜底。
 */
export async function detectCodex(timeoutMs = VERSION_TIMEOUT_MS) {
  const desktop = await desktopNativeCandidates();
  const where = (await whereCodexExe()).filter((p) => !p.toLowerCase().includes('node'));
  const candidates = [...desktop, ...where, 'codex'];
  const seen = new Set();
  for (const cli of candidates) {
    if (seen.has(cli)) continue;
    seen.add(cli);
    const r = await runVersion(cli, timeoutMs);
    if (r.installed) {
      return { ...r, path: cli === 'codex' ? null : cli, source: classifySource(cli) };
    }
  }
  return { installed: false, version: null, reason: 'not_found' };
}

/**
 * 从 JSONL 事件中提取可公开上报的摘要（阶段/命令/文件变化）。
 * 不回传原始 prompt 或模型长文本，只回传结构化事件元数据。
 */
function summarizeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const t = ev.type;
  switch (t) {
    case 'thread.started':
      return { type: 'thread_started' };
    case 'turn.started':
      return { type: 'turn_started' };
    case 'item.started': {
      const item = ev.item || {};
      if (item.type === 'message' || item.type === 'agent_message') return { type: 'message_started' };
      if (item.type === 'tool_call' || item.type === 'mcp_tool_call') return { type: 'tool_call_started', name: item.name || null };
      if (item.type === 'command_execution') return { type: 'command_started' };
      return null;
    }
    case 'item.completed': {
      const item = ev.item || {};
      if (item.type === 'tool_call' || item.type === 'mcp_tool_call') {
        return { type: 'tool_call_completed', name: item.name || null };
      }
      if (item.type === 'command_execution') {
        return { type: 'command_completed' };
      }
      return null;
    }
    case 'command.executed':
    case 'command.started':
      return { type: 'command', command: typeof ev.command === 'string' ? ev.command.slice(0, 200) : null };
    case 'file.changed':
    case 'file.modified':
    case 'file.created':
      return { type: 'file_change', path: ev.path ? String(ev.path).slice(0, 300) : null };
    case 'turn.completed':
      return { type: 'turn_completed' };
    case 'error':
      return { type: 'error', message: ev.message ? String(ev.message).slice(0, 300) : null };
    case 'turn.failed':
      return { type: 'turn_failed', message: ev.error?.message ? String(ev.error.message).slice(0, 300) : null };
    default:
      return null;
  }
}

/** 脱敏：将 JSONL 事件写入 trace 文件时，剔除可能含敏感信息的字段 */
function desensitizeEvent(ev) {
  const copy = { ...ev };
  // 只保留 type 与结构化元数据，丢弃可能含原始内容的大字段
  if (copy.item && typeof copy.item === 'object') {
    const item = { ...copy.item };
    if (item.content) delete item.content;
    if (item.text) item.text = String(item.text).slice(0, 200);
    copy.item = item;
  }
  if (copy.message) copy.message = String(copy.message).slice(0, 300);
  return copy;
}

/**
 * S6/S11/S14/S16：向 Codex 投递固定触发语。
 * - 工作根目录 = CONTENT_ROOT（D:\database），不用目标导师子目录作为 -C。
 * - prompt 走 stdin 并立即 EOF；- 作为位置参数表示从 stdin 读取。
 *
 * @param {object} opts
 * @param {string} opts.baseDir       CONTENT_ROOT 绝对路径（D:\database）
 * @param {string} opts.trigger       固定触发语
 * @param {string} [opts.threadId]    已有对话 thread_id（续轮时传入）
 * @param {string} [opts.taskType]    任务类型，决定总超时上限（smoke/assembly_round1/...）
 * @returns {Promise<{ok:boolean, threadId?:string, output?:string, tracePath?:string, lastMessagePath?:string, events?:Array, reason?:string, exitCode?:number}>}
 */
export async function deliverTrigger({ baseDir, trigger, threadId, taskType = 'default' }) {
  if (!baseDir || !trigger) {
    return { ok: false, reason: 'baseDir 和 trigger 必填' };
  }
  const detected = await detectCodex();
  if (!detected.installed) {
    return { ok: false, reason: `codex 未安装: ${detected.reason}` };
  }
  const codexExe = detected.path || 'codex';
  const useShell = codexExe === 'codex';

  // trace 文件与 last-message 文件放在 baseDir 下的 _runner-traces 目录
  const traceDir = path.join(baseDir, '_runner-traces');
  await mkdir(traceDir, { recursive: true }).catch(() => {});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tracePath = path.join(traceDir, `codex-${stamp}.jsonl`);
  const lastMessagePath = path.join(traceDir, `codex-${stamp}-last.txt`);

  // 参数：-C baseDir + approve-for-me（隐含 workspace-write 沙箱）+ json + 输出最后消息 + stdin 输入
  // 注意：--sandbox 与 --approve-for-me 互斥，后者已隐含 workspace-write
  const args = [
    'exec',
    '-C', baseDir,
    '--skip-git-repo-check',
    '--approve-for-me',
    '--json',
    '--output-last-message', lastMessagePath,
    '-',
  ];
  if (threadId) {
    // resume 放在 - 之前
    args.splice(args.indexOf('-'), 0, 'resume', threadId);
  }

  const totalTimeout = TASK_TIMEOUTS[taskType] ?? TASK_TIMEOUTS.default;

  const result = await runCodexExec({
    exe: codexExe,
    args,
    useShell,
    stdinData: trigger,
    tracePath,
    lastMessagePath,
    totalTimeoutMs: totalTimeout,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
  });
  return result;
}

/**
 * 执行 codex exec 并实时解析 --json 输出（JSONL）。
 *
 * 关键修复：
 * 1. prompt 走 stdin，spawn 后立即 child.stdin.end(stdinData, 'utf8') 发送 EOF。
 * 2. stdout 按行实时消费，每行解析为事件并写入 trace 文件。
 * 3. 两级超时：无活动超时（idle）+ 总任务上限（total）。
 * 4. --output-last-message 文件保存最终回复，避免 JSONL 结构变化丢文本。
 * 5. 非零退出码一律失败（删除"有 threadId 即成功"的旧逻辑）。
 */
function runCodexExec({ exe, args, useShell, stdinData, tracePath, lastMessagePath, totalTimeoutMs, idleTimeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      shell: useShell,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    });

    // 立即写入 stdin 并发送 EOF —— 这是修复超时的核心
    child.stdin.end(stdinData, 'utf8');

    let stdoutBuffer = '';
    let stderrTail = '';
    let done = false;
    let threadId = null;
    let fatalError = null;
    let lastActivityAt = Date.now();
    const events = [];
    const publicEvents = [];

    // 总任务上限定时器
    const totalTimer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve({
        ok: false,
        reason: `codex exec 总任务超时（>${totalTimeoutMs / 1000}s）`,
        threadId,
        tracePath,
        lastMessagePath,
        events: publicEvents,
        exitCode: null,
      });
    }, totalTimeoutMs);

    // 无活动超时定时器
    let idleTimer = setTimeout(onIdle, idleTimeoutMs);
    function resetIdle() {
      lastActivityAt = Date.now();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(onIdle, idleTimeoutMs);
    }
    function onIdle() {
      if (done) return;
      done = true;
      clearTimeout(totalTimer);
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve({
        ok: false,
        reason: `codex exec 无活动超时（>${idleTimeoutMs / 1000}s 无 JSONL 事件）`,
        threadId,
        tracePath,
        lastMessagePath,
        events: publicEvents,
        exitCode: null,
      });
    }

    // stdout 按行实时消费
    child.stdout.on('data', (d) => {
      stdoutBuffer += d.toString();
      let idx;
      while ((idx = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, idx).trim();
        stdoutBuffer = stdoutBuffer.slice(idx + 1);
        if (!line) continue;
        resetIdle();
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        events.push(ev);
        // 写入脱敏 trace
        appendFile(tracePath, JSON.stringify(desensitizeEvent(ev)) + '\n').catch(() => {});
        // 提取 threadId / fatalError
        if (ev.type === 'thread.started' && ev.thread_id) threadId = ev.thread_id;
        if (ev.type === 'error' && ev.message && !fatalError) fatalError = String(ev.message);
        if (ev.type === 'turn.failed' && ev.error?.message) fatalError = String(ev.error.message);
        // 可公开摘要
        const pub = summarizeEvent(ev);
        if (pub) publicEvents.push(pub);
      }
    });

    child.stderr.on('data', (d) => {
      // stderr 只保留尾部用于诊断，不当作事件
      const s = d.toString();
      stderrTail = (stderrTail + s).slice(-2000);
    });

    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(totalTimer);
      clearTimeout(idleTimer);
      resolve({
        ok: false,
        reason: err.code === 'ENOENT' ? 'codex 可执行文件不存在' : err.message,
        threadId,
        tracePath,
        lastMessagePath,
        events: publicEvents,
        exitCode: null,
      });
    });

    child.on('close', async (code) => {
      if (done) return;
      done = true;
      clearTimeout(totalTimer);
      clearTimeout(idleTimer);

      // 非零退出码一律失败
      if (code !== 0) {
        resolve({
          ok: false,
          reason: `codex exec 退出码 ${code}${stderrTail ? `：${stderrTail.slice(0, 500)}` : ''}`,
          threadId,
          tracePath,
          lastMessagePath,
          events: publicEvents,
          exitCode: code,
        });
        return;
      }

      // 退出码 0，但 JSONL 中有 fatalError 也判失败
      if (fatalError) {
        resolve({
          ok: false,
          reason: fatalError,
          threadId,
          tracePath,
          lastMessagePath,
          events: publicEvents,
          exitCode: code,
        });
        return;
      }

      // 成功：从 --output-last-message 文件读取最终回复
      let output = '';
      try {
        output = (await readFile(lastMessagePath, 'utf8')).trim();
      } catch {
        output = '';
      }
      // 兜底：若 last-message 文件为空，尝试从 JSONL 事件中提取文本
      if (!output) {
        output = extractTextFromEvents(events);
      }

      resolve({
        ok: true,
        threadId,
        output,
        tracePath,
        lastMessagePath,
        events: publicEvents,
        exitCode: code,
      });
    });
  });
}

/** 从 JSONL 事件中提取最终 agent_message 文本（兜底） */
function extractTextFromEvents(events) {
  const parts = [];
  for (const ev of events) {
    if (ev.type === 'item.completed' && ev.item?.type === 'message' && Array.isArray(ev.item.content)) {
      for (const block of ev.item.content) {
        if (block && typeof block.text === 'string') parts.push(block.text);
      }
    } else if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && typeof ev.item.text === 'string') {
      parts.push(ev.item.text);
    }
  }
  return parts.join('\n').trim();
}

/** 计算文件 SHA-256（供 smoke 测试验证用） */
export async function sha256File(absPath) {
  const buf = await readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
}
