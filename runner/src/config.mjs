/**
 * Runner 本地配置：runner/.state/config.json
 * - machineKey：安装时生成，全局唯一，绝不随仓库提交
 * - runnerToken：注册成功后由控制平面颁发
 * .state/ 已在 .gitignore 排除。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONTENT_ROOT } from './filer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RUNNER_ROOT = path.resolve(HERE, '..');
export const STATE_DIR = path.join(RUNNER_ROOT, '.state');
export const CONFIG_PATH = path.join(STATE_DIR, 'config.json');
export const PROCESSED_PATH = path.join(STATE_DIR, 'processed.json');

export const RUNNER_VERSION = '0.1.0';

export async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    return {
      baseUrl: cfg.baseUrl,
      machineKey: cfg.machineKey,
      runnerId: cfg.runnerId ?? null,
      runnerToken: cfg.runnerToken ?? null,
      runnerName: cfg.runnerName ?? hostName(),
      contentRoot: cfg.contentRoot ?? DEFAULT_CONTENT_ROOT,
      heartbeatMs: cfg.heartbeatMs ?? 30_000,
    };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return null;
  }
}

export async function saveConfig(cfg) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), { encoding: 'utf8' });
}

export function newMachineKey() {
  return `runner-${randomUUID()}`;
}

function hostName() {
  try {
    return os.hostname() || 'windows-runner';
  } catch {
    return 'windows-runner';
  }
}

/** 已处理指令幂等记录：{ [idempotencyKey]: { status, at, resultDigest } } */
export async function loadProcessed() {
  try {
    return JSON.parse(await readFile(PROCESSED_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveProcessed(record) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(PROCESSED_PATH, JSON.stringify(record, null, 2), { encoding: 'utf8' });
}
