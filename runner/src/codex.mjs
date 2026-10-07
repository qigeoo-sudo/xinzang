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

export const CODEX_DELIVER_STATUS = 'needs_validation';

const VERSION_TIMEOUT_MS = 15_000;

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
 * M5 验证点：非交互投递固定触发语到指定 Codex 对话。
 * 当前不实现真实驱动——返回 needs_validation，禁止在未验证时声称可投递。
 * P2 方向（已确认）：`codex exec -C <工作区> --json "<触发语>"` + 保存导师 session UUID，
 * 后续轮次用 queue/resume 续到同一任务；app-server/remote-control 实验特性不作为 v1 依赖。
 */
export async function deliverTrigger() {
  return { supported: false, status: CODEX_DELIVER_STATUS };
}
