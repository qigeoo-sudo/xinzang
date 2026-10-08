import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUN_STATE,
  STEP_STATUS,
  STEP_DEFS,
  ACTIVE_CODES,
  ROUND1_QC_ITEMS,
  getStepDef,
  nextStepCode,
  normalizeMentorDirKey,
  mentorDirStatus,
  canTransition,
} from '../src/lib/content-ops/state-machine';
import { evaluateVpnHint, type EndpointKey, type VpnSnapshot } from '../src/lib/content-ops/vpn-policy';
import { COMPARE_DIMENSIONS, COMPARE_PASS_LINE, belowLine, allDocsPass, type DocCompareResult } from '../src/lib/content-ops/ai-compare';
import { buildReplyFileName, filterReplyCandidates, type ReplyMessageMeta } from '../src/lib/content-ops/reply';
import { pickAbsorbPackages } from '../src/lib/content-ops/absorb';
import {
  groupRound2Materials,
  round2DestDir,
  MATERIAL_GROUP_GAP_MS,
} from '../src/lib/content-ops/round2-material';

const NOW = Date.parse('2026-10-07T10:00:00.000Z');

function snapshot(overrides: Partial<Record<EndpointKey, boolean>> = {}): VpnSnapshot {
  const reach = (v: boolean) => ({ reachable: v, latencyMs: 20 });
  const endpoints: VpnSnapshot['endpoints'] = {
    feishu: reach(true),
    claude: reach(false),
    codex: reach(false),
    github: reach(false),
    vpnIndicator: reach(false),
    cnBase: reach(true),
  };
  for (const key of Object.keys(overrides) as EndpointKey[]) {
    endpoints[key] = reach(Boolean(overrides[key]));
  }
  return { checkedAt: new Date(NOW - 5_000).toISOString(), endpoints };
}

// ---------------- 步骤定义完整性 ----------------

test('S0-S22 共 23 步，已开放边界随试点推进（P1=S0-S7，P2a=S8-S9，P2b=S10-S11，P2c=S12-S16，P4a=S17-S20，P4b=S21-S22）', () => {
  assert.equal(STEP_DEFS.length, 23);
  assert.deepEqual(
    ACTIVE_CODES,
    ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22'],
  );
  assert.equal(getStepDef('S0').owner, 'control_plane');
  assert.equal(nextStepCode('S7'), 'S8');
  assert.equal(nextStepCode('S22'), null);
});

test('未开放步骤不允许出现激活标记', () => {
  for (const def of STEP_DEFS) {
    if (!def.active) {
      const n = parseInt(def.code.slice(1), 10);
      assert.ok(n >= 21, `${def.code} 不应激活（P4b 仅开放 S21/S22）`);
    }
  }
});

// ---------------- 导师目录归一化 ----------------

test('导师目录键不区分大小写并压缩空格', () => {
  assert.equal(normalizeMentorDirKey('  EchoHuang  '), 'echohuang');
  assert.equal(normalizeMentorDirKey('Lydia   Chen'), 'lydia chen');
});

test('aaaa bbb 忽略、z-others/xinzang 只读、其他正常', () => {
  assert.equal(mentorDirStatus('AAAA BBB'), 'ignored');
  assert.equal(mentorDirStatus('z-Others'), 'readonly');
  assert.equal(mentorDirStatus('xinzang'), 'readonly');
  assert.equal(mentorDirStatus('lydia chen pilot'), 'ok');
});

// ---------------- 状态迁移 ----------------

test('主线可前进、不能乱跳终态', () => {
  assert.equal(
    canTransition(RUN_STATE.WAITING_ROUND1_SUBMISSION, RUN_STATE.CLAUDE_MANUAL_STEP),
    true,
  );
  assert.equal(canTransition(RUN_STATE.COMPLETED, RUN_STATE.CLAUDE_MANUAL_STEP), false);
});

test('waiting_runner 只能被心跳解除或进入干预态', () => {
  assert.equal(canTransition(RUN_STATE.WAITING_RUNNER, RUN_STATE.WAITING_ROUND1_SUBMISSION), true);
  assert.equal(canTransition(RUN_STATE.WAITING_RUNNER, RUN_STATE.CLAUDE_MANUAL_STEP), false);
  assert.equal(canTransition(RUN_STATE.WAITING_RUNNER, 'cancelled'), true);
});

test('QC 失败可按显式分支回退，不能任意倒退', () => {
  assert.equal(
    canTransition(RUN_STATE.ROUND1_DOCS_QC_FAILED, RUN_STATE.CODEX_ROUND1_ASSEMBLY),
    true,
  );
  assert.equal(
    canTransition(RUN_STATE.CLAUDE_OUTPUT_ARCHIVED, RUN_STATE.WAITING_ROUND1_SUBMISSION),
    false,
  );
});

test('非终态可进入等待人工/失败/中断，完成态不可取消', () => {
  assert.equal(canTransition(RUN_STATE.CODEX_ROUND1_ASSEMBLY, 'waiting_human_input'), true);
  assert.equal(canTransition(RUN_STATE.CODEX_ROUND1_ASSEMBLY, 'failed'), true);
  assert.equal(canTransition(RUN_STATE.COMPLETED, 'cancelled'), false);
});

// ---------------- VPN 提示策略 ----------------

test('Runner 离线 → 灰态，明确无法探测', () => {
  const hint = evaluateVpnHint(getStepDef('S4'), false, snapshot({ claude: true }), NOW);
  assert.equal(hint.level, 'gray');
  assert.match(hint.title, /Runner 未启动/);
});

test('S4 需要 Claude 且不通 → 红态，提示开 VPN', () => {
  const hint = evaluateVpnHint(getStepDef('S4'), true, snapshot({}), NOW);
  assert.equal(hint.level, 'red');
  assert.match(hint.title, /需要 VPN/);
  const claude = hint.endpoints.find((e) => e.key === 'claude');
  assert.equal(claude?.required, true);
  assert.equal(claude?.reachable, false);
});

test('S4 Claude 可达且 VPN 指示点通 → 绿态', () => {
  const hint = evaluateVpnHint(
    getStepDef('S4'),
    true,
    snapshot({ claude: true, vpnIndicator: true }),
    NOW,
  );
  assert.equal(hint.level, 'green');
});

test('S1 飞书步且 VPN 开着 → 黄态，仅提示关闭', () => {
  const hint = evaluateVpnHint(
    getStepDef('S1'),
    true,
    snapshot({ feishu: true, vpnIndicator: true }),
    NOW,
  );
  assert.equal(hint.level, 'amber');
  assert.match(hint.title, /建议关闭/);
});

test('S1 飞书直连且 VPN 关 → 绿态', () => {
  const hint = evaluateVpnHint(
    getStepDef('S1'),
    true,
    snapshot({ feishu: true, vpnIndicator: false }),
    NOW,
  );
  assert.equal(hint.level, 'green');
});

test('探测快照过期 → 灰态，不拿旧数据冒充', () => {
  const stale: VpnSnapshot = {
    ...snapshot({ claude: true }),
    checkedAt: new Date(NOW - 120_000).toISOString(),
  };
  const hint = evaluateVpnHint(getStepDef('S4'), true, stale, NOW);
  assert.equal(hint.level, 'gray');
  assert.match(hint.title, /等待 Runner/);
});

test('国内参照点也不通 → 灰态提示本机断网，而不是误报开 VPN', () => {
  const hint = evaluateVpnHint(
    getStepDef('S4'),
    true,
    snapshot({ cnBase: false, claude: false }),
    NOW,
  );
  assert.equal(hint.level, 'gray');
  assert.match(hint.title, /本机网络可能未连接/);
});

test('无下一步且 Runner 在线 → 绿态但不声称网络已全部验证', () => {
  const hint = evaluateVpnHint(null, true, snapshot({}), NOW);
  assert.equal(hint.level, 'green');
  assert.match(hint.title, /没有需要网络的待办/);
});

test('步骤状态枚举与 Schema 注释口径一致（防误改字符串）', () => {
  assert.deepEqual(Object.values(STEP_STATUS).sort(), [
    'blocked',
    'done',
    'failed',
    'pending',
    'running',
    'skipped',
    'waiting_human',
  ]);
});

// ---------------- S8 AI 四维比对 ----------------

test('AI 比对四维 key 与面板/状态机 ROUND1_QC_ITEMS 完全一致', () => {
  assert.deepEqual(COMPARE_DIMENSIONS.map((d) => d.key), ROUND1_QC_ITEMS.map((i) => i.key));
});

test('及格线固定 80：79 不及格、80 及格', () => {
  assert.equal(COMPARE_PASS_LINE, 80);
  assert.deepEqual(belowLine(scoredDoc({ duty: 79 })), ['duty']);
  assert.deepEqual(belowLine(scoredDoc({})), []);
  assert.deepEqual(belowLine(scoredDoc({ structure: 80, density: 80 })), []);
});

function scoredDoc(over: Partial<Record<string, number>>): DocCompareResult {
  const scores = { structure: 80, duty: 80, density: 80, readability: 80, ...over };
  return { docType: 'style_analysis', relPath: 'x.md', scores, reasons: {}, findings: [], summary: '', model: 'test' };
}

test('两份文件全部维度 ≥80 → aiPass=true；任一维 79 → false', () => {
  assert.equal(allDocsPass([scoredDoc({}), scoredDoc({ readability: 95 })]), true);
  assert.equal(allDocsPass([scoredDoc({}), scoredDoc({ duty: 79 })]), false);
  assert.equal(allDocsPass([scoredDoc({ structure: 60 })]), false);
});

// ---------------- S10 回复候选与 `_回复` 命名 ----------------

test('_回复 命名：扩展名前追加、已含回复不重复、无扩展名/隐藏文件尾追', () => {
  assert.equal(buildReplyFileName('Ying_Wang_第一轮审核清单_v0.1.md'), 'Ying_Wang_第一轮审核清单_v0.1_回复.md');
  assert.equal(buildReplyFileName('回复-第一轮审核清单.pdf'), '回复-第一轮审核清单.pdf');
  assert.equal(buildReplyFileName('第一轮审核清单'), '第一轮审核清单_回复');
  assert.equal(buildReplyFileName('.gitignore'), '.gitignore_回复');
  assert.throws(() => buildReplyFileName('   '), /文件名为空/);
});

test('回复候选四条筛选口径：七字全中才列出、音频/第二轮/我方发送一律排除', () => {
  const file = (
    messageId: string,
    fileName: string,
    extra: Partial<Parameters<typeof filterReplyCandidates>[0][number]> = {},
  ) => ({
    messageId,
    msgType: 'file',
    createTime: 100,
    senderName: '王颖',
    senderType: 'user',
    deleted: false,
    fileName,
    fileKey: `fk-${messageId}`,
    ...extra,
  });
  const view = filterReplyCandidates([
    file('m1', 'Ying_Wang_第一轮审核清单_v0.1.md', { createTime: 120 }),
    { messageId: 'm2', msgType: 'text', createTime: 110, senderName: '王颖', senderType: 'user', deleted: false },
    file('m3', '第一轮审核清单录音.m4a'), // 含关键词但是音频 → audio
    file('m4', '第二轮计划_第一轮审核清单.md'), // 同时命中第二轮与关键词 → round2 优先
    file('m5', 'Ying_Wang_第一轮审核清单_v0.1.md', { createTime: 130, senderName: '陆秉文' }),
    file('m6', '机器人发的第一轮审核清单.md', { senderType: 'app' }),
    file('m7', '随手传的资料.docx'), // 不含七字关键词 → keywordMiss
    file('m8', '已删的第一轮审核清单.md', { deleted: true }),
    file('m9', '王颖_回复_第一轮审核清单.md', { createTime: 140 }),
    { messageId: 'm10', msgType: 'image', createTime: 95, senderName: '王颖', senderType: 'user', deleted: false },
  ]);
  assert.equal(view.textMessageCount, 1);
  assert.equal(view.deletedCount, 1);
  assert.deepEqual(view.candidates.map((c) => c.messageId), ['m9', 'm1']); // 时间新→旧
  assert.equal(view.candidates[0].alreadyNamedReply, true);
  assert.equal(view.candidates[1].alreadyNamedReply, false);
  assert.deepEqual(view.skipped, {
    selfSender: 2, // m5 陆秉文 + m6 机器人
    audio: 1,
    otherRound: 1,
    keywordMiss: 1,
    noFileKey: 0,
    otherType: 1,
  });
});

test('七字必须完整连续命中：缺字/近义词不进候选', () => {
  const view = filterReplyCandidates([
    { messageId: 'a', msgType: 'file', createTime: 1, senderName: '王颖', senderType: 'user', deleted: false, fileName: '第一轮审核表.md', fileKey: 'ka' },
    { messageId: 'b', msgType: 'file', createTime: 2, senderName: '王颖', senderType: 'user', deleted: false, fileName: '第1轮审核清单.md', fileKey: 'kb' },
    { messageId: 'c', msgType: 'file', createTime: 3, senderName: '王颖', senderType: 'user', deleted: false, fileName: '王颖第一轮审核清单回复.docx', fileKey: 'kc' },
  ]);
  assert.deepEqual(view.candidates.map((c) => c.messageId), ['c']);
  assert.equal(view.skipped.keywordMiss, 2);
});

// ---------------- P2b 状态推进 ----------------

test('P2b 主线推进：round1_docs_sent → waiting_round1_review_reply → round1_reply_received → codex_round1_absorb', () => {
  assert.equal(canTransition(RUN_STATE.ROUND1_DOCS_SENT, RUN_STATE.WAITING_ROUND1_REVIEW_REPLY), true);
  assert.equal(canTransition(RUN_STATE.WAITING_ROUND1_REVIEW_REPLY, RUN_STATE.ROUND1_REPLY_RECEIVED), true);
  assert.equal(canTransition(RUN_STATE.ROUND1_REPLY_RECEIVED, RUN_STATE.CODEX_ROUND1_ABSORB), true);
  // 前进跳过瞬时态允许（调用方按步骤收敛），回退不允许
  assert.equal(canTransition(RUN_STATE.ROUND1_REPLY_RECEIVED, RUN_STATE.ROUND1_DOCS_SENT), false);
  assert.equal(canTransition(RUN_STATE.ROUND1_DOCS_SENT, RUN_STATE.WAITING_ROUND1_SUBMISSION), false);
  assert.equal(getStepDef('S10').nextRunState, RUN_STATE.ROUND1_REPLY_RECEIVED);
  assert.equal(getStepDef('S11').nextRunState, RUN_STATE.CODEX_ROUND1_ABSORB);
});

// ---------------- S11 吸收版本包识别 ----------------

test('S11 选包：有时间戳只出 mtime 最新的一份，新包自动推荐', () => {
  const r = pickAbsorbPackages({
    submittedAt: '2026-10-08T02:00:00.000Z',
    previousPackage: 'ying-v0.1',
    packages: [
      { name: 'ying-v0.1', mtime: '2026-10-07T08:00:00.000Z' }, // S7 已核验
      { name: 'ying-v0.2', mtime: '2026-10-08T03:10:00.000Z' }, // 本轮新包（最新）
      { name: 'ying-v0.3-wip', mtime: '2026-10-08T02:30:00.000Z' }, // 更早的新包
    ],
  });
  assert.equal(r.ready, true);
  assert.equal(r.recommended, 'ying-v0.2');
  assert.equal(r.packages.length, 1); // 只出最新一份
  assert.equal(r.packages[0].name, 'ying-v0.2');
  assert.equal(r.packages[0].isPreviousRound, false);
  assert.equal(r.packages[0].afterSubmit, true);
  assert.equal(r.packages[0].recommended, true);
});

test('S11 选包：最新包早于提交时刻 → ready=false，但仍列出该包供人工核对', () => {
  const r = pickAbsorbPackages({
    submittedAt: '2026-10-08T05:00:00.000Z',
    previousPackage: null,
    packages: [
      { name: 'ying-v0.1', mtime: '2026-10-08T01:00:00.000Z' },
      { name: 'ying-v0.2', mtime: '2026-10-08T04:59:00.000Z' }, // 早一分钟
    ],
  });
  assert.equal(r.ready, false);
  assert.equal(r.recommended, null);
  assert.equal(r.packages.length, 1);
  assert.equal(r.packages[0].name, 'ying-v0.2');
  assert.equal(r.packages[0].recommended, false);
});

test('S11 选包：Codex 就地更新 S7 旧包 → 不自动推荐，留人工确认', () => {
  const r = pickAbsorbPackages({
    submittedAt: '2026-10-08T02:00:00.000Z',
    previousPackage: 'ying-v0.1',
    packages: [{ name: 'ying-v0.1', mtime: '2026-10-08T03:30:00.000Z' }],
  });
  assert.equal(r.ready, false);
  assert.equal(r.recommended, null);
  assert.deepEqual(
    r.packages.map((p) => [p.name, p.isPreviousRound, p.afterSubmit]),
    [['ying-v0.1', true, true]],
  );
});

// ---------------- P2c：S16 第二轮回复筛选（round=2） ----------------

test('第二轮回复筛选：命中「第二轮审核清单」收，第一轮/音频/我方一律排', () => {
  const f = (
    messageId: string,
    fileName: string,
    extra: Partial<ReplyMessageMeta> = {},
  ): ReplyMessageMeta => ({
    messageId,
    msgType: 'file',
    createTime: 200,
    senderName: '王颖',
    senderType: 'user',
    deleted: false,
    fileName,
    fileKey: `fk-${messageId}`,
    ...extra,
  });
  const view = filterReplyCandidates(
    [
      f('r1', 'Ying_Wang_第二轮审核清单_v0.3.md', { createTime: 230 }),
      f('r2', '第二轮审核清单_附带第一轮说明.md'), // 含「第一轮」→ 互斥归另一轮
      f('r3', '第二轮审核清单录音.m4a'), // 音频
      f('r4', 'Ying_Wang_第二轮审核清单_v0.2.md', { senderName: '陆秉文' }), // 我方
      f('r5', 'Ying_Wang_第二轮审核清单_v0.3.md', { senderType: 'app' }), // 机器人
      f('r6', '无关资料.docx'), // 关键词缺失
      { messageId: 'r7', msgType: 'text', createTime: 210, senderName: '王颖', senderType: 'user', deleted: false },
      f('r8', '已撤回的第二轮审核清单.md', { deleted: true }),
    ],
    2,
  );
  assert.deepEqual(view.candidates.map((c) => c.messageId), ['r1']);
  assert.equal(view.textMessageCount, 1);
  assert.equal(view.deletedCount, 1);
  assert.deepEqual(view.skipped, {
    selfSender: 2,
    audio: 1,
    otherRound: 1,
    keywordMiss: 1,
    noFileKey: 0,
    otherType: 0,
  });
});

// ---------------- P2c：S13 第二轮材料事件分组 ----------------

const SINCE = Date.parse('2026-10-09T01:00:00.000Z');

function mat(
  messageId: string,
  ts: number | null,
  extra: Partial<ReplyMessageMeta> = {},
): ReplyMessageMeta {
  return {
    messageId,
    msgType: 'file',
    createTime: ts,
    senderName: '王颖',
    senderType: 'user',
    deleted: false,
    fileName: `${messageId}.bin`,
    fileKey: `fk-${messageId}`,
    ...extra,
  };
}

test('S13 窗内两个含音频事件：建议最早无冲突组，同时给歧义提示', () => {
  const view = groupRound2Materials(
    [
      mat('a1', SINCE + 10 * 60_000, { fileName: '访谈.m4a' }),
      mat('a2', SINCE + 12 * 60_000, { fileName: '文稿.docx' }),
      mat('b1', SINCE + 120 * 60_000, { fileName: '访谈补录.m4a' }),
    ],
    SINCE,
  );
  assert.equal(view.groups.length, 2);
  assert.equal(view.suggestedGroupId, 'g0');
  assert.equal(view.groups[0].hasAudio, true);
  assert.equal(view.groups[0].files.length, 2);
  assert.ok(view.ambiguity.some((a) => a.includes('2 个含音频')));
});

test('S13 窗内无音频：无建议组且给未发现音频提示', () => {
  const view = groupRound2Materials(
    [mat('t1', SINCE + 5 * 60_000, { fileName: '只有文稿.docx' })],
    SINCE,
  );
  assert.equal(view.suggestedGroupId, null);
  assert.equal(view.groups[0].hasAudio, false);
  assert.ok(view.ambiguity.some((a) => a.includes('未发现含音频')));
});

test('S13 唯一音频组文件名带补传信号：不建议，给分段/补录提示', () => {
  const view = groupRound2Materials(
    [mat('x1', SINCE + 5 * 60_000, { fileName: '访谈补传.m4a' })],
    SINCE,
  );
  assert.equal(view.suggestedGroupId, null);
  assert.equal(view.groups[0].files[0].conflictHint, true);
  assert.ok(view.ambiguity.some((a) => a.includes('补传/重传/补发')));
});

test('S13 硬性排除：文件名含「第一轮」「审核清单」一律不进候选', () => {
  const view = groupRound2Materials(
    [
      mat('f1', SINCE + 5 * 60_000, { fileName: '第一轮访谈.m4a' }),
      mat('f2', SINCE + 6 * 60_000, { fileName: 'Ying_Wang_第二轮审核清单_v0.3.md' }),
      mat('f3', null, { fileName: '第一轮审核清单_回复.md' }), // 无时间也照样排除（审核清单优先）
      mat('ok', SINCE + 10 * 60_000, { fileName: '第二轮访谈.m4a' }),
    ],
    SINCE,
  );
  assert.equal(view.skipped.firstRound, 1);
  assert.equal(view.skipped.reviewDoc, 2);
  assert.equal(view.groups.length, 1);
  assert.deepEqual(view.groups[0].files.map((f) => f.messageId), ['ok']);
  assert.equal(view.suggestedGroupId, 'g0');
});

test('S13 无时间且已在 S1/S2/S10 归档/归并过的文件不再出现（忽略扩展名比对）；有时间的不受此限', () => {
  // 归档集合存的是去掉扩展名后的 base
  const archived = new Set(['老录音', 'ying_wang_第一轮审核清单_v0.1_回复']);
  const view = groupRound2Materials(
    [
      mat('u1', null, { fileName: '老录音.opus' }), // 无时间+已归档（base 相同扩展名不同）→ 排除
      mat('u2', null, { fileName: 'Ying_Wang_第一轮审核清单_v0.1_回复.md' }), // 先被「审核清单」排除
      mat('u3', null, { fileName: '未见过的新文稿.docx' }), // 无时间+未归档 → 保留
      mat('t1', SINCE + 60_000, { fileName: '老录音.m4a' }), // 有时间即使 base 同名也保留（窗内新事件）
    ],
    SINCE,
    archived,
  );
  assert.equal(view.skipped.archivedBefore, 1);
  assert.equal(view.skipped.reviewDoc, 1);
  const ids = view.groups.flatMap((g) => g.files.map((f) => f.messageId));
  assert.deepEqual(ids.sort(), ['t1', 'u3']);
});

test('S13 S12 之前的消息全部计入 beforeSince，不进任何组', () => {
  const view = groupRound2Materials(
    [
      mat('old1', SINCE - 1, { fileName: '早前录音.m4a' }),
      mat('old2', SINCE - 3600_000, { fileName: '早前文稿.docx' }),
      mat('new1', SINCE + 60_000, { fileName: '第二轮.m4a' }),
    ],
    SINCE,
  );
  assert.equal(view.skipped.beforeSince, 2);
  assert.equal(view.groups.length, 1);
  assert.deepEqual(view.groups[0].files.map((f) => f.messageId), ['new1']);
});

test('S13 无上传时间的文件各自成组且永不参与建议', () => {
  const view = groupRound2Materials(
    [
      mat('z1', null, { fileName: '录音.m4a' }),
      mat('z2', null, { fileName: '文稿.docx' }),
      mat('ok', SINCE + 60_000, { fileName: '第二轮录音.m4a' }),
    ],
    SINCE,
  );
  assert.equal(view.groups.length, 3);
  assert.equal(view.suggestedGroupId, 'g0'); // 有时间的 ok 组先入组并被建议
  assert.ok(view.groups.slice(1).every((g) => !g.suggested && g.files.length === 1));
  assert.ok(view.ambiguity.some((a) => a.includes('缺少上传时间')));
});

test('S13 30 分钟间隔边界：恰好 30 分钟同组，超过 1ms 切两组', () => {
  const atEdge = groupRound2Materials(
    [
      mat('e1', SINCE, { fileName: 'a.m4a' }),
      mat('e2', SINCE + MATERIAL_GROUP_GAP_MS, { fileName: 'b.docx' }),
    ],
    SINCE,
  );
  assert.equal(atEdge.groups.length, 1);

  const overEdge = groupRound2Materials(
    [
      mat('o1', SINCE, { fileName: 'a.m4a' }),
      mat('o2', SINCE + MATERIAL_GROUP_GAP_MS + 1, { fileName: 'b.docx' }),
    ],
    SINCE,
  );
  assert.equal(overEdge.groups.length, 2);
});

test('S13 类型识别：audio 语音消息/音频扩展为音频，文档扩展为文稿，我方与文本跳过', () => {
  const view = groupRound2Materials(
    [
      mat('v1', SINCE + 1000, { msgType: 'audio', fileName: null }),
      mat('v2', SINCE + 2000, { fileName: 'song.opus' }),
      mat('v3', SINCE + 3000, { fileName: 'note.txt' }),
      mat('v4', SINCE + 4000, { fileName: 'sheet.xlsx' }),
      mat('me', SINCE + 5000, { fileName: '我发的.m4a', senderName: '陆秉文' }),
      { messageId: 'txt', msgType: 'text', createTime: SINCE + 6000, senderName: '王颖', senderType: 'user', deleted: false },
    ],
    SINCE,
  );
  const all = view.groups.flatMap((g) => g.files);
  assert.deepEqual(all.map((f) => [f.messageId, f.kind]), [
    ['v1', 'audio'],
    ['v2', 'audio'],
    ['v3', 'transcript'],
    ['v4', 'other'],
  ]);
  assert.equal(view.skipped.selfSender, 1);
  assert.equal(view.skipped.text, 1);
});

test('S13 归档目录：音频/文稿分别落到导师第二轮 interview audio/word 子目录', () => {
  assert.equal(
    round2DestDir('D:\\database', 'ying wang', 'audio'),
    'D:\\database\\mentors\\ying wang\\ying wang audio\\ying wang 第二轮 interview audio',
  );
  assert.equal(
    round2DestDir('D:\\database', 'ying wang', 'word'),
    'D:\\database\\mentors\\ying wang\\ying wang word\\ying wang 第二轮 interview word',
  );
});

// ---------------- P2c：第二轮主线状态迁移 ----------------

test('P2c 主线：S12-S16 关键状态迁移连通，失败态只能回滚到 CODEX_ROUND2_UPDATE', () => {
  assert.equal(canTransition(RUN_STATE.CODEX_ROUND1_ABSORB, RUN_STATE.ROUND2_OUTLINE_SENT), true);
  assert.equal(canTransition(RUN_STATE.ROUND2_OUTLINE_SENT, RUN_STATE.WAITING_ROUND2_SUBMISSION), true);
  assert.equal(canTransition(RUN_STATE.WAITING_ROUND2_SUBMISSION, RUN_STATE.ROUND2_MATERIAL_RECEIVED), true);
  assert.equal(canTransition(RUN_STATE.ROUND2_MATERIAL_RECEIVED, RUN_STATE.CODEX_ROUND2_UPDATE), true);
  assert.equal(canTransition(RUN_STATE.CODEX_ROUND2_UPDATE, RUN_STATE.ROUND2_DOCS_QC), true);
  assert.equal(canTransition(RUN_STATE.ROUND2_DOCS_QC, RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_DOCS), true);
  assert.equal(canTransition(RUN_STATE.AWAITING_SEND_APPROVAL_ROUND2_DOCS, RUN_STATE.ROUND2_DOCS_SENT), true);
  assert.equal(canTransition(RUN_STATE.ROUND2_DOCS_SENT, RUN_STATE.WAITING_ROUND2_REVIEW_REPLY), true);
  assert.equal(canTransition(RUN_STATE.WAITING_ROUND2_REVIEW_REPLY, RUN_STATE.ROUND2_REPLY_RECEIVED), true);
  assert.equal(canTransition(RUN_STATE.ROUND2_REPLY_RECEIVED, RUN_STATE.CODEX_FINAL_ABSORB), true);
  // 不能从第二轮中段跳回首轮状态
  assert.equal(canTransition(RUN_STATE.ROUND2_MATERIAL_RECEIVED, RUN_STATE.WAITING_ROUND1_REVIEW_REPLY), false);
  assert.equal(getStepDef('S13').nextRunState, RUN_STATE.ROUND2_MATERIAL_RECEIVED);
  assert.equal(getStepDef('S15').nextRunState, RUN_STATE.ROUND2_DOCS_SENT);
  assert.equal(getStepDef('S16').nextRunState, RUN_STATE.CODEX_FINAL_ABSORB);
});
