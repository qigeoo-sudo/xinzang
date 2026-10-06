/**
 * Codex CLI 能力探测与（M5 待验证的）非交互驱动。
 * P1 边界：只做 detect()；codex_deliver 自动投递是 needs_validation 能力，
 * 在 M5 实测确认非交互模式稳定前，控制平面按钮置灰，默认走人工复制触发语。
 */
import { spawn } from 'node:child_process';

export const CODEX_DELIVER_STATUS = 'needs_validation';

/** 探测 codex CLI 是否在 PATH 及版本；Windows 全局 npm 安装为 codex.cmd，需要 shell */
export function detectCodex(timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const child = spawn('codex', ['--version'], {
      shell: process.platform === 'win32',
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
      if (code === 0) {
        finish({ installed: true, version: stdout.trim() || null, reason: null });
      } else {
        finish({ installed: false, version: null, reason: `exit_${code}`, stderr: stderr.slice(0, 200) });
      }
    });
  });
}

/**
 * M5 验证点：非交互投递固定触发语到指定 Codex 对话。
 * 当前不实现真实驱动——返回 needs_validation，禁止在未验证时声称可投递。
 */
export async function deliverTrigger() {
  return { supported: false, status: CODEX_DELIVER_STATUS };
}
