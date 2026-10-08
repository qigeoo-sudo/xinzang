import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCardIdContinuity,
  checkClassificationDisclosure,
  checkCoreFiles,
  checkSchema,
  checkSourceHashAudioCoverage,
  checkTraeHandoffCompleteness,
  checkUnabsorbedRepliesPrivacy,
  checkPromptSystem,
  checkDualSnapshotReconciliation,
  runAllChecks,
  PREFLIGHT_ITEMS,
  type PreflightInput,
} from '../src/lib/content-ops/preflight-checks';

const sha = (c: string) => c.repeat(64);

function makeInput(over: Partial<PreflightInput['handoff']> = {}): PreflightInput {
  return {
    runId: 'r1',
    mentorDir: 'ying wang',
    handoff: {
      packagePath: 'D:/database/mentors/ying wang/work/ying-final-handoff-v0.4',
      version: 'v0.4',
      coreFiles: [
        { name: '00_START_HERE.md', relPath: '00_START_HERE.md', exists: true, sha256: sha('a'), bytes: 100 },
        { name: 'source_manifest_final.json', relPath: 'source_manifest_final.json', exists: true, sha256: sha('b'), bytes: 200 },
        { name: 'TRAE_HANDOFF.md', relPath: 'TRAE_HANDOFF.md', exists: true, sha256: sha('c'), bytes: 300 },
        { name: 'VALIDATION_REPORT.md', relPath: 'VALIDATION_REPORT.md', exists: true, sha256: sha('d'), bytes: 400 },
      ],
      sourceManifest: {},
      traeHandoff: {
        candidatePromptPath: 'prompt.md',
        candidatePromptSha256: sha('e'),
        knowledgeSnapshotPath: 'kb.jsonl',
        targetAppPaths: ['kb-governance/'],
        testList: ['schema', 'build'],
        rollbackPlan: '回滚方案',
        writebackRequirements: ['回传 A'],
        hasSingleCandidate: true,
      },
      validationReport: { schema: 'pass', source: 'pass', classification: 'pass', privacy: 'pass', prompt: 'pass', fullPackage: 'pass', audioCoverage: 'pass' },
      knowledgeCards: [
        { cardId: 'c1', mentorId: 'ying wang', round: 1, knowledgeClass: 'internal_approved', disclosureMode: 'none', sourceSha256: sha('x'), sourceBytes: 100, hasCase: false },
        { cardId: 'c2', mentorId: 'ying wang', round: 2, knowledgeClass: 'external_approved', disclosureMode: 'generalized', sourceSha256: sha('y'), sourceBytes: 200, hasCase: true },
      ],
      promptSystemSnapshot: { persona: 'ying', capabilities: ['c1'], boundaries: ['b1'], evals: [], manifestStatus: 'pass' },
      baselineSnapshot: null,
      appIntegrationSnapshot: null,
      ...over,
    },
  };
}

describe('preflight-checks', () => {
  it('PREFLIGHT_ITEMS 有 9 项', () => {
    assert.equal(PREFLIGHT_ITEMS.length, 9);
  });

  it('checkCoreFiles 四件套齐全通过', () => {
    const r = checkCoreFiles(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkCoreFiles 缺四件套失败', () => {
    const input = makeInput({
      coreFiles: [
        { name: '00_START_HERE.md', relPath: '00_START_HERE.md', exists: true, sha256: sha('a'), bytes: 100 },
        { name: 'source_manifest_final.json', relPath: 'source_manifest_final.json', exists: true, sha256: sha('b'), bytes: 200 },
        // 缺 TRAE_HANDOFF.md 和 VALIDATION_REPORT.md
      ],
    });
    const r = checkCoreFiles(input);
    assert.equal(r.status, 'fail');
    assert.equal(r.responsibleParty, 'codex');
  });

  it('checkCardIdContinuity 唯一+连续通过', () => {
    const r = checkCardIdContinuity(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkCardIdContinuity 重复失败', () => {
    const input = makeInput({
      knowledgeCards: [
        { cardId: 'c1', mentorId: 'ying wang', round: 1, knowledgeClass: 'internal_approved', disclosureMode: 'none', sourceSha256: sha('x'), sourceBytes: 100, hasCase: false },
        { cardId: 'c1', mentorId: 'ying wang', round: 1, knowledgeClass: 'internal_approved', disclosureMode: 'none', sourceSha256: sha('x'), sourceBytes: 100, hasCase: false },
      ],
    });
    const r = checkCardIdContinuity(input);
    assert.equal(r.status, 'fail');
  });

  it('checkClassificationDisclosure 合法组合通过', () => {
    const r = checkClassificationDisclosure(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkClassificationDisclosure internal 不 none 失败', () => {
    const input = makeInput({
      knowledgeCards: [
        { cardId: 'c1', mentorId: 'ying wang', round: 1, knowledgeClass: 'internal_approved', disclosureMode: 'generalized', sourceSha256: sha('x'), sourceBytes: 100, hasCase: false },
      ],
    });
    const r = checkClassificationDisclosure(input);
    assert.equal(r.status, 'fail');
  });

  it('checkSchema schema=pass 通过', () => {
    const r = checkSchema(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkSchema 空卡失败', () => {
    const input = makeInput({ knowledgeCards: [] });
    const r = checkSchema(input);
    assert.equal(r.status, 'fail');
  });

  it('checkSourceHashAudioCoverage 全有通过', () => {
    const r = checkSourceHashAudioCoverage(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkUnabsorbedRepliesPrivacy 同导师通过', () => {
    const r = checkUnabsorbedRepliesPrivacy(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkUnabsorbedRepliesPrivacy 跨导师失败', () => {
    const input = makeInput({
      knowledgeCards: [
        { cardId: 'c1', mentorId: 'phyllis chi', round: 1, knowledgeClass: 'internal_approved', disclosureMode: 'none', sourceSha256: sha('x'), sourceBytes: 100, hasCase: false },
      ],
    });
    const r = checkUnabsorbedRepliesPrivacy(input);
    assert.equal(r.status, 'fail');
  });

  it('checkTraeHandoffCompleteness 完整通过', () => {
    const r = checkTraeHandoffCompleteness(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkTraeHandoffCompleteness 缺回滚失败', () => {
    const input = makeInput({
      traeHandoff: {
        candidatePromptPath: 'prompt.md',
        candidatePromptSha256: sha('e'),
        knowledgeSnapshotPath: 'kb.jsonl',
        targetAppPaths: ['kb-governance/'],
        testList: ['schema'],
        rollbackPlan: null, // 缺
        writebackRequirements: ['回传 A'],
        hasSingleCandidate: true,
      },
    });
    const r = checkTraeHandoffCompleteness(input);
    assert.equal(r.status, 'fail');
  });

  it('checkPromptSystem 完整通过', () => {
    const r = checkPromptSystem(makeInput());
    assert.equal(r.status, 'pass');
  });

  it('checkPromptSystem 缺 persona 失败', () => {
    const input = makeInput({
      promptSystemSnapshot: { persona: null, capabilities: ['c1'], boundaries: ['b1'], evals: [], manifestStatus: 'pass' },
    });
    const r = checkPromptSystem(input);
    assert.equal(r.status, 'fail');
  });

  it('checkDualSnapshotReconciliation 一侧缺失 warn', () => {
    const r = checkDualSnapshotReconciliation(makeInput());
    assert.equal(r.status, 'warn');
  });

  it('checkDualSnapshotReconciliation mentorId 不一致 fail', () => {
    const input = makeInput({
      baselineSnapshot: { mentorId: 'ying wang', totalCards: 2, promptVersion: 'v1', promptSha256: sha('p'), cardHashes: { c1: sha('a'), c2: sha('b') }, mtime: '2026-10-08T00:00:00Z' },
      appIntegrationSnapshot: { mentorId: 'phyllis chi', totalCards: 2, promptVersion: 'v1', promptSha256: sha('p'), cardHashes: { c1: sha('a'), c2: sha('b') }, mtime: '2026-10-08T00:00:00Z' },
    });
    const r = checkDualSnapshotReconciliation(input);
    assert.equal(r.status, 'fail');
  });

  it('checkDualSnapshotReconciliation 一致通过', () => {
    const input = makeInput({
      baselineSnapshot: { mentorId: 'ying wang', totalCards: 2, promptVersion: 'v1', promptSha256: sha('p'), cardHashes: { c1: sha('a'), c2: sha('b') }, mtime: '2026-10-08T00:00:00Z' },
      appIntegrationSnapshot: { mentorId: 'ying wang', totalCards: 2, promptVersion: 'v1', promptSha256: sha('p'), cardHashes: { c1: sha('a'), c2: sha('b') }, mtime: '2026-10-08T00:00:00Z' },
    });
    const r = checkDualSnapshotReconciliation(input);
    assert.equal(r.status, 'pass');
  });

  it('runAllChecks 全过时 allPass=true 且 pendingCount=0', () => {
    const out = runAllChecks(makeInput());
    assert.equal(out.allPass, true);
    assert.deepEqual(out.pendingCount, { external: 0, internal: 0 });
    assert.equal(out.results.length, 9);
  });

  it('runAllChecks 有 pending 卡时 allPass 仍 true 但 pendingCount>0', () => {
    const input = makeInput({
      knowledgeCards: [
        { cardId: 'c1', mentorId: 'ying wang', round: 1, knowledgeClass: 'internal_pending', disclosureMode: 'none', sourceSha256: sha('x'), sourceBytes: 100, hasCase: false },
        { cardId: 'c2', mentorId: 'ying wang', round: 2, knowledgeClass: 'external_pending', disclosureMode: 'generalized', sourceSha256: sha('y'), sourceBytes: 200, hasCase: true },
      ],
    });
    const out = runAllChecks(input);
    assert.equal(out.allPass, true); // pending 卡不阻塞预检本身
    assert.deepEqual(out.pendingCount, { external: 1, internal: 1 });
  });
});
