/**
 * 文件系统能力：导师目录扫描、SHA-256 哈希、路径安全。
 * 纯函数部分可单测；目录/哈希的权威判定在控制平面（TS 状态机库），
 * Runner 上报的候选结果服务端必须重算校验，Runner 侧规则只用于减少无效上报。
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_CONTENT_ROOT = 'D:\\database';
export const MENTORS_DIRNAME = 'mentors';

/** 与 src/lib/content-ops/state-machine.ts normalizeMentorDirKey 保持一致 */
export function normalizeMentorDirKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 模板目录（下划线前缀）不参与导师匹配 */
export function mentorDirStatus(name) {
  const key = normalizeMentorDirKey(name);
  if (key === 'aaaa bbb') return 'ignored';
  if (key === 'z-others') return 'readonly';
  if (name.startsWith('_')) return 'template';
  return 'ok';
}

/**
 * 扫描 contentRoot/mentors 一级目录。
 * 返回 [{ name, key, status, hasWorkDir }]，不递归、不读取文件内容。
 */
export async function listMentorDirs(contentRoot) {
  const mentorsRoot = path.join(contentRoot, MENTORS_DIRNAME);
  let entries;
  try {
    entries = await readdir(mentorsRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`导师根目录不存在: ${mentorsRoot}（检查 CONTENT_ROOT 配置）`);
    }
    throw err;
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const status = mentorDirStatus(entry.name);
    let hasWorkDir = false;
    try {
      const s = await stat(path.join(mentorsRoot, entry.name, 'work'));
      hasWorkDir = s.isDirectory();
    } catch {
      hasWorkDir = false;
    }
    out.push({ name: entry.name, key: normalizeMentorDirKey(entry.name), status, hasWorkDir });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * 展示用相对路径：相对 contentRoot，统一为正斜杠。
 * contentRoot 之外的路径返回 null（调用方按越权处理）。
 */
export function toDisplayPath(absPath, contentRoot) {
  const rel = path.relative(contentRoot, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** 路径必须位于 contentRoot 之内，防止指令让 Runner 哈希任意系统文件 */
export function isInsideContentRoot(target, contentRoot) {
  const rel = path.relative(contentRoot, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 流式计算 SHA-256 与字节数，不把文件读进内存 */
export function hashFile(absPath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let bytes = 0n;
    const stream = createReadStream(absPath);
    stream.on('data', (chunk) => {
      bytes += BigInt(chunk.length);
      hash.update(chunk);
    });
    stream.on('end', () => resolve({ sha256: hash.digest('hex'), bytes: bytes.toString() }));
    stream.on('error', reject);
  });
}

/** 扫描某位导师 work 目录下的版本包：含 00_START_HERE.md 的一级子目录视为版本包 */
export async function scanWorkPackages(contentRoot, mentorDir) {
  const mentorRoot = path.join(contentRoot, MENTORS_DIRNAME, mentorDir);
  if (!isInsideContentRoot(mentorRoot, contentRoot)) {
    throw new Error(`导师目录越界: ${mentorDir}`);
  }
  const workRoot = path.join(mentorRoot, 'work');
  let entries;
  try {
    entries = await readdir(workRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgDir = path.join(workRoot, entry.name);
    let hasStartHere = false;
    let startHereStat = null;
    try {
      const s = await stat(path.join(pkgDir, '00_START_HERE.md'));
      hasStartHere = s.isFile();
      startHereStat = { mtime: s.mtime.toISOString(), size: s.size };
    } catch {
      hasStartHere = false;
    }
    out.push({ name: entry.name, hasStartHere, startHereStat });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
