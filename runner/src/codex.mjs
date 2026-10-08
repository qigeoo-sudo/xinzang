/**
 * Codex CLI 能力探测与（M5 待验证的）非交互驱动。
 * P1 边界：只做 detect()；codex_deliver 自动投递是 needs_validation 能力，
 * 在 M5 实测确认非交互模式稳定前，控制平面按钮置灰，默认走人工复制触发语。
 *
 * 探测策略（2026-10-07 按用户与 Codex 确认的约定）：
 * - 优先桌面原生 codex.exe，npm 全局 shim（codex.cmd/ps1，版本较旧）只作兜底
 * - 不写死随机构建号目录：先 where.exe 动态发现，再扫桌面版默认安装区取最新构建
 */
import { spawn, execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const CODEX_DELIVER_STATUS = 'ready';

const VERSION_TIMEOUT_MS = 15_000;
const EXEC_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟，留给模型回复

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
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ installed: false, version: null, reason: 'timeout' }), timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
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
  try {
    builds = await readdir(base, { withFileTypes: true });
  } catch {
    return out;
  }
  const hits = [];
  for (const b of builds) {
    if (!b.isDirectory()) continue;
    const exe = path.join(base, b.name, 'codex.exe');
    try {
      const s = await stat(exe);
      if (s.isFile()) hits.push({ exe, mtimeMs: s.mtimeMs });
    } catch {
      /* 构建目录内无 codex.exe，跳过 */
    }
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
 * 探测本机 Codex CLI：按「where 发现的 codex.exe → 桌面安装区最新构建 → npm shim」顺序，
 * 逐个尝试 --version，第一个成功者胜出。返回 {installed, version, path?, source?, reason?}。
 */
export async function detectCodex(timeoutMs = VERSION_TIMEOUT_MS) {
  const candidates = [...(await whereCodexExe()), ...(await desktopNativeCandidates()), 'codex'];
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
 * S6/S11/S14/S16：向 Codex 投递固定触发语。
 * - 无 threadId：新开对话（`codex exec ... <prompt>`）
 * - 有 threadId：复用同一对话（`codex exec resume <threadId> <prompt>`）
 * 安全：用 spawn 参数数组传递中文触发语，绝不 shell 拼接，防止注入。
 *
 * @param {object} opts
 * @param {string} opts.workspaceDir  导师工作目录绝对路径
 * @param {string} opts.trigger        固定触发语
 * @param {string} [opts.threadId]     已有对话 thread_id（续轮时传入）
 * @returns {Promise<{ok:boolean, threadId?:string, output?:string, reason?:string}>}
 */
export async function deliverTrigger({ workspaceDir, trigger, threadId }) {
  if (!workspaceDir || !trigger) {
    return { ok: false, reason: 'workspaceDir 和 trigger 必填' };
  }
  const detected = await detectCodex();
  if (!detected.installed) {
    return { ok: false, reason: `codex 未安装: ${detected.reason}` };
  }
  const codexExe = detected.path || 'codex';
  const useShell = codexExe === 'codex';

  // 组装参数：全局选项放在 exec 之后、子命令之前
  const args = ['exec', '-C', workspaceDir, '--skip-git-repo-check', '--json'];
  if (threadId) {
    args.push('resume', threadId);
  }
  args.push(trigger);

  const result = await runCodexExec(codexExe, args, useShell);
  return result;
}

/**
 * 执行 codex exec 并解析 --json 输出（JSONL）。
 * 提取 thread.started.thread_id 和最终消息文本；捕获 error/turn.failed。
 */
function runCodexExec(exe, args, useShell) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      shell: useShell,
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        resolve({ ok: false, reason: `codex exec 超时（>${EXEC_TIMEOUT_MS / 1000}s）` });
      }
    }, EXEC_TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, reason: err.code === 'ENOENT' ? 'codex 可执行文件不存在' : err.message });
    });

    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const parsed = parseCodexJsonl(stdout);
      // turn.failed 或 error 事件判定为失败
      if (parsed.fatalError) {
        resolve({ ok: false, threadId: parsed.threadId, reason: parsed.fatalError });
        return;
      }
      if (code !== 0 && !parsed.threadId) {
        resolve({
          ok: false,
          reason: `codex exec 退出码 ${code}${stderr ? `：${stderr.slice(0, 300)}` : ''}`,
        });
        return;
      }
      resolve({ ok: true, threadId: parsed.threadId, output: parsed.output });
    });
  });
}

/** 解析 codex --json 的 JSONL 输出，提取 thread_id 与最终文本 */
function parseCodexJsonl(raw) {
  const out = { threadId: null, output: '', fatalError: null };
  const textParts = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    switch (ev.type) {
      case 'thread.started':
        out.threadId = ev.thread_id || null;
        break;
      case 'item.completed': {
        const item = ev.item || {};
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block && typeof block.text === 'string') textParts.push(block.text);
          }
        }
        break;
      }
      case 'error':
        if (!out.fatalError && ev.message) out.fatalError = String(ev.message);
        break;
      case 'turn.failed':
        if (ev.error && ev.error.message) out.fatalError = String(ev.error.message);
        break;
      default:
        break;
    }
  }
  out.output = textParts.join('\n').trim();
  return out;
}
