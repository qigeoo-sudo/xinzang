/**
 * 第一轮材料归并：多份音频 ffmpeg concat + 多份文字稿按序拼接
 * 命名：<mentorDir> 第一轮 full interview.m4a / <mentorDir> 第一轮 full transcript.md
 * 原件保留不动，归并产物是新增文件
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { isInsideContentRoot, toDisplayPath } from './filer.mjs';

const ILLEGAL_FS_CHARS = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' };
function sanitizeFileNameForFs(name) {
  return name.replace(/[\\/:*?"<>|]/g, (ch) => ILLEGAL_FS_CHARS[ch] ?? '_');
}

function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(absPath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function runFfmpeg(args) {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', () => resolve({ ok: false, stderr: 'ffmpeg 执行失败' }));
    proc.on('close', (code) => resolve({ ok: code === 0, stderr }));
  });
}

/**
 * 音频归并：优先 concat demuxer（-c copy 无损快拼），失败回退重编码
 * 单文件时直接复制为 full 命名
 */
async function mergeAudio({ mentorDir, audioOrder, contentRoot }) {
  const outDir = path.join(contentRoot, 'mentors', mentorDir, `${mentorDir} audio`, `${mentorDir} 第一轮 interview audio`);
  await mkdir(outDir, { recursive: true });

  const safeName = sanitizeFileNameForFs(`${mentorDir} 第一轮 full interview`);
  const outAbs = path.join(outDir, `${safeName}.m4a`);

  if (audioOrder.length === 1) {
    const src = audioOrder[0];
    if (!path.isAbsolute(src) || !isInsideContentRoot(src, contentRoot)) {
      return { ok: false, reason: `音频源路径越界: ${src}` };
    }
    await copyFile(src, outAbs);
  } else {
    for (const src of audioOrder) {
      if (!path.isAbsolute(src) || !isInsideContentRoot(src, contentRoot)) {
        return { ok: false, reason: `音频源路径越界: ${src}` };
      }
    }
    const listFile = path.join(outDir, `.merge_list_${Date.now()}.txt`);
    const listContent = audioOrder.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    await writeFile(listFile, listContent, 'utf8');

    let r = await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outAbs]);
    if (!r.ok) {
      const inputs = [];
      for (const f of audioOrder) inputs.push('-i', f);
      const filter = audioOrder.map((_, i) => `[${i}:a]`).join('') + `concat=n=${audioOrder.length}:v=0:a=1[out]`;
      r = await runFfmpeg([
        ...inputs,
        '-filter_complex', filter,
        '-map', '[out]',
        '-c:a', 'aac', '-b:a', '128k',
        '-y', outAbs,
      ]);
    }
    await unlink(listFile).catch(() => {});
    if (!r.ok) return { ok: false, reason: `ffmpeg 归并失败: ${r.stderr.slice(-500)}` };
  }

  const st = await stat(outAbs);
  const sha = await sha256File(outAbs);
  return {
    ok: true,
    absPath: outAbs,
    relPath: toDisplayPath(outAbs, contentRoot),
    bytes: st.size,
    sha256: sha,
    sourceCount: audioOrder.length,
  };
}

/**
 * 文字稿归并：按序拼接，每份前加标题分隔符
 * 单文件时直接复制为 full 命名
 */
async function mergeText({ mentorDir, textOrder, contentRoot }) {
  const outDir = path.join(contentRoot, 'mentors', mentorDir, `${mentorDir} word`, `${mentorDir} 第一轮 interview word`);
  await mkdir(outDir, { recursive: true });

  const safeName = sanitizeFileNameForFs(`${mentorDir} 第一轮 full transcript`);
  const outAbs = path.join(outDir, `${safeName}.md`);

  const manifest = [];

  if (textOrder.length === 1) {
    const src = textOrder[0];
    if (!path.isAbsolute(src) || !isInsideContentRoot(src, contentRoot)) {
      return { ok: false, reason: `文字稿源路径越界: ${src}` };
    }
    const content = await readFile(src, 'utf8');
    await writeFile(outAbs, content, 'utf8');
    manifest.push({ source: path.basename(src), bytes: Buffer.byteLength(content) });
  } else {
    const parts = [];
    for (const src of textOrder) {
      if (!path.isAbsolute(src) || !isInsideContentRoot(src, contentRoot)) {
        return { ok: false, reason: `文字稿源路径越界: ${src}` };
      }
      const content = await readFile(src, 'utf8');
      const name = path.basename(src);
      parts.push(`\n\n---\n\n# 文件：${name}\n\n${content}`);
      manifest.push({ source: name, bytes: Buffer.byteLength(content) });
    }
    const header = `# ${mentorDir} 第一轮访谈文字稿（归并稿）\n\n本文件由 ${textOrder.length} 份文字稿按音频顺序归并生成。\n`;
    await writeFile(outAbs, header + parts.join(''), 'utf8');
  }

  const st = await stat(outAbs);
  const sha = await sha256File(outAbs);
  return {
    ok: true,
    absPath: outAbs,
    relPath: toDisplayPath(outAbs, contentRoot),
    bytes: st.size,
    sha256: sha,
    sourceCount: textOrder.length,
    manifest,
  };
}

export async function mergeRound1Materials({ mentorDir, audioOrder, textOrder, contentRoot }) {
  if (!mentorDir) return { ok: false, reason: '缺少 mentorDir' };
  const audio = Array.isArray(audioOrder) ? audioOrder : [];
  const text = Array.isArray(textOrder) ? textOrder : [];
  if (audio.length === 0 && text.length === 0) return { ok: false, reason: '没有可归并的文件' };

  const results = {};

  if (audio.length > 0) {
    const r = await mergeAudio({ mentorDir, audioOrder: audio, contentRoot });
    if (!r.ok) return { ok: false, reason: `音频归并失败: ${r.reason}` };
    results.audio = r;
  }

  if (text.length > 0) {
    const r = await mergeText({ mentorDir, textOrder: text, contentRoot });
    if (!r.ok) return { ok: false, reason: `文字稿归并失败: ${r.reason}` };
    results.text = r;
  }

  return { ok: true, ...results };
}
