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

/**
 * 按扩展名判定文件在 S1 登记中的类型（纯函数，可单测）。
 * 扩展名白名单内音频/文稿两类互斥，故直接按扩展名归类；
 * 白名单外的文件在扫描阶段已被过滤，不会走到这里。
 * @param {string} relPath 相对 CONTENT_ROOT、正斜杠路径
 * @returns {'source_audio'|'source_transcript'|null}
 */
export function guessSourceKind(relPath) {
  const lower = relPath.toLowerCase();
  const AUDIO_EXT = ['.m4a', '.mp3', '.wav', '.aac', '.amr', '.ogg', '.flac'];
  const TEXT_EXT = ['.md', '.txt', '.docx', '.doc'];
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (AUDIO_EXT.includes(ext)) return 'source_audio';
  if (TEXT_EXT.includes(ext)) return 'source_transcript';
  return null;
}

/** 扫描候选文件时跳过的子目录（产物区/治理区，不属于导师提交材料） */
const SCAN_SKIP_DIRS = new Set(['work', 'outputs', 'knowledge-governance', '.git', 'node_modules']);
const SCAN_EXT_WHITELIST = new Set([
  '.m4a', '.mp3', '.wav', '.aac', '.amr', '.ogg', '.flac',
  '.md', '.txt', '.docx', '.doc',
]);
const SCAN_MAX_FILES = 300;

/**
 * 按扩展名判定文件在 S2 归档登记中的类型（纯函数）。
 * 归并后音频 → merged_audio；规范化命名文字稿 → normalized_md。
 * @param {string} relPath 相对 CONTENT_ROOT、正斜杠路径
 * @returns {'merged_audio'|'normalized_md'|null}
 */
export function guessArchiveKind(relPath) {
  const lower = relPath.toLowerCase();
  const AUDIO_EXT = ['.m4a', '.mp3', '.wav', '.aac', '.amr', '.ogg', '.flac'];
  const TEXT_EXT = ['.md', '.txt', '.docx', '.doc'];
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (AUDIO_EXT.includes(ext)) return 'merged_audio';
  if (TEXT_EXT.includes(ext)) return 'normalized_md';
  return null;
}

/**
 * 递归扫描某位导师目录下的候选材料文件（S1「扫描+勾选」）。
 * 只返回元数据：相对路径/字节数/修改时间/预猜类型；不读文件内容、不进 work 产物区。
 */
export async function listMentorFiles(contentRoot, mentorDir) {
  const mentorRoot = path.join(contentRoot, MENTORS_DIRNAME, mentorDir);
  if (!isInsideContentRoot(mentorRoot, contentRoot)) {
    throw new Error(`导师目录越界: ${mentorDir}`);
  }
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      if (out.length >= SCAN_MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SCAN_SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (!SCAN_EXT_WHITELIST.has(ext)) continue;
        let s;
        try {
          s = await stat(full);
        } catch {
          continue;
        }
        const relPath = toDisplayPath(full, contentRoot);
        if (!relPath) continue;
        out.push({
          relPath,
          bytes: s.size,
          mtimeMs: s.mtimeMs,
          suggestedKind: guessSourceKind(relPath),
        });
      }
    }
  }
  await walk(mentorRoot);
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/**
 * 扫描某位导师目录下的归档产物文件（S2「扫描+勾选」）。
 * 递归扫描整个导师目录（不跳过子目录），但只返回文件名含 "full" 的文件
 * （归并后的完整音频/完整文字稿命名约定带 full 字样，便于 Codex 后续优先调取）。
 * 只返回元数据：相对路径/字节数/修改时间/预猜归档类型；不读文件内容。
 */
export async function listWorkFiles(contentRoot, mentorDir) {
  const mentorRoot = path.join(contentRoot, MENTORS_DIRNAME, mentorDir);
  if (!isInsideContentRoot(mentorRoot, contentRoot)) {
    throw new Error(`导师目录越界: ${mentorDir}`);
  }
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      if (out.length >= SCAN_MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        // 只取文件名含 "full" 的归并产物（大小写不敏感）
        if (!entry.name.toLowerCase().includes('full')) continue;
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (!SCAN_EXT_WHITELIST.has(ext)) continue;
        let s;
        try {
          s = await stat(full);
        } catch {
          continue;
        }
        const relPath = toDisplayPath(full, contentRoot);
        if (!relPath) continue;
        out.push({
          relPath,
          bytes: s.size,
          mtimeMs: s.mtimeMs,
          suggestedKind: guessArchiveKind(relPath),
        });
      }
    }
  }
  await walk(mentorRoot);
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
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
