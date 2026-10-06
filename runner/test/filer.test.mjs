import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_CONTENT_ROOT,
  hashFile,
  isInsideContentRoot,
  listMentorDirs,
  mentorDirStatus,
  normalizeMentorDirKey,
  scanWorkPackages,
  toDisplayPath,
} from '../src/filer.mjs';

test('默认内容根指向 D:\\database', () => {
  assert.equal(DEFAULT_CONTENT_ROOT, 'D:\\database');
});

test('目录键归一化与 TS 权威库口径一致', () => {
  assert.equal(normalizeMentorDirKey('  Echo Huang '), 'echo huang');
  assert.equal(normalizeMentorDirKey('Lydia    Chen'), 'lydia chen');
});

test('导师目录状态：aaaa bbb 忽略、z-others 只读、_ 前缀模板、其余正常', () => {
  assert.equal(mentorDirStatus('aaaa bbb'), 'ignored');
  assert.equal(mentorDirStatus('z-Others'), 'readonly');
  assert.equal(mentorDirStatus('_templates'), 'template');
  assert.equal(mentorDirStatus('lydia chen pilot'), 'ok');
});

test('toDisplayPath 输出正斜杠相对路径，越界返回 null', () => {
  const root = 'D:\\database';
  assert.equal(
    toDisplayPath('D:\\database\\mentors\\lydia chen\\work\\a.md', root),
    'mentors/lydia chen/work/a.md',
  );
  assert.equal(toDisplayPath('C:\\Windows\\system32', root), null);
  assert.equal(isInsideContentRoot('D:\\database\\mentors\\a', root), true);
  assert.equal(isInsideContentRoot('D\\database-evil\\x', root), false);
});

test('listMentorDirs 与 scanWorkPackages 在临时目录上正确识别 work 与版本包', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-filer-'));
  try {
    const mk = (p) => mkdir(p, { recursive: true });
    await mk(path.join(root, 'mentors', 'alpha', 'work', 'alpha-v0.1'));
    await writeFile(path.join(root, 'mentors', 'alpha', 'work', 'alpha-v0.1', '00_START_HERE.md'), '# hi');
    await mk(path.join(root, 'mentors', 'beta'));
    await mk(path.join(root, 'mentors', '_templates'));
    await mk(path.join(root, 'mentors', 'z-others'));

    const dirs = await listMentorDirs(root);
    const byName = Object.fromEntries(dirs.map((d) => [d.name, d]));
    assert.equal(byName.alpha.hasWorkDir, true);
    assert.equal(byName.beta.hasWorkDir, false);
    assert.equal(byName._templates.status, 'template');
    assert.equal(byName['z-others'].status, 'readonly');

    const pkgs = await scanWorkPackages(root, 'alpha');
    assert.deepEqual(
      pkgs.map((p) => ({ name: p.name, hasStartHere: p.hasStartHere })),
      [{ name: 'alpha-v0.1', hasStartHere: true }],
    );

    await assert.rejects(() => scanWorkPackages(root, '..\\..\\evil'), /越界/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('hashFile 对已知内容输出正确 SHA-256 与字节数', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-hash-'));
  try {
    const file = path.join(root, 'sample.txt');
    const content = 'abc'; // sha256('abc') 是知名固定值
    await writeFile(file, content, 'ascii');
    const r = await hashFile(file);
    assert.equal(
      r.sha256,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    assert.equal(r.bytes, '3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
