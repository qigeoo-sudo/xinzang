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

test('S0-S22 共 23 步，已开放边界随试点推进（P1=S0-S7，P2a=S8-S9）', () => {
  assert.equal(STEP_DEFS.length, 23);
  assert.deepEqual(ACTIVE_CODES, ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);
  assert.equal(getStepDef('S0').owner, 'control_plane');
  assert.equal(nextStepCode('S7'), 'S8');
  assert.equal(nextStepCode('S22'), null);
});

test('未开放步骤不允许出现激活标记', () => {
  for (const def of STEP_DEFS) {
    if (!def.active) {
      const n = parseInt(def.code.slice(1), 10);
      assert.ok(n >= 10, `${def.code} 不应激活`);
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
