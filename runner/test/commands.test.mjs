import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRound2ChecklistFile, locateRound2Docs } from '../src/commands.mjs';

test('S15 候选命名：命中第二轮审核清单才收，回复稿/更新稿/第一轮/无关文件排除', () => {
  assert.equal(isRound2ChecklistFile('Ying_Wang_第二轮审核清单_v0.3.md'), true);
  assert.equal(isRound2ChecklistFile('张三_第二轮审核清单_v1.2.txt'), true);
  assert.equal(isRound2ChecklistFile('Ying_Wang_第二轮审核清单_v0.3_回复.md'), false);
  assert.equal(isRound2ChecklistFile('Ying_Wang_第二轮审核清单更新版.md'), false);
  assert.equal(isRound2ChecklistFile('Ying_Wang_第一轮审核清单_v0.1.md'), false);
  assert.equal(isRound2ChecklistFile('随手笔记.md'), false);
});

test('S15 参数防穿越：空导师/空包名/路径分隔符/父级跳转一律拒绝（不触盘）', async () => {
  await assert.rejects(() => locateRound2Docs('D:\\database', '', 'ying-v0.3'), /参数非法/);
  await assert.rejects(() => locateRound2Docs('D:\\database', 'ying wang', ''), /参数非法/);
  await assert.rejects(() => locateRound2Docs('D:\\database', 'ying wang', '../evil'), /参数非法/);
  await assert.rejects(() => locateRound2Docs('D:\\database', 'ying wang', 'a/b'), /参数非法/);
  await assert.rejects(() => locateRound2Docs('D:\\database', 'ying wang', 'a\\b'), /参数非法/);
});
