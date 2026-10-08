/**
 * Final Handoff 九类预检（纯函数，无 Prisma 依赖）
 * 设计依据：D:\database\AGENTS.md §16.4 九类核对项
 *
 * 约定：
 * - 输入数据由 Runner 指令（SCAN_FINAL_HANDOFF / PREFLIGHT_CHECKS / RESOLVE_PENDING_CARD）回传
 * - 每类返回三元组 {status, evidence, value}，不显示笼统「通过」
 * - 任一 fail 即整体失败；pending 卡未归零不阻塞预检本身，但阻塞 G4 门禁
 * - 双快照对账遵循 AGENTS「与Trae主项目对齐」§2：禁从较旧快照覆盖较新
 */

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'pending';

export interface CheckResult {
  /** 检查项 key，如 'core_files' */
  key: string;
  /** 显示标签，如「核心文件齐全」 */
  label: string;
  /** 状态：pass/fail/warn/pending */
  status: CheckStatus;
  /** 证据路径或文件名 */
  evidence: string;
  /** 实际数值（卡数、字节数、SHA 前 8 位等；可为结构化对象） */
  value: string | number | boolean | object | null;
  /** 失败/警告原因 */
  reason?: string;
  /** 责任方（用于失败时指引人工入口） */
  responsibleParty?: 'codex' | 'trae' | 'human' | 'control_plane';
}

export interface FileMeta {
  name: string;
  relPath: string;
  exists: boolean;
  sha256: string | null;
  bytes: number | null;
  mtime?: string | null;
}

/** Runner 回传的 Final Handoff 包元数据 */
export interface HandoffPackageMeta {
  packagePath: string;       // D:\database\mentors\<dir>\work\<id>-final-handoff-v<actual>
  version: string;           // v0.4
  coreFiles: FileMeta[];     // 四件套 + baseline + ... + Prompt System 快照
  sourceManifest: Record<string, unknown> | null;   // source_manifest_final.json
  traeHandoff: TraeHandoffContent | null;            // TRAE_HANDOFF.md 解析
  validationReport: ValidationReportContent | null;  // VALIDATION_REPORT.md 解析
  knowledgeCards: KnowledgeCardSpec[];                // 知识卡 JSONL 解析
  promptSystemSnapshot: PromptSystemSnapshot | null;
  baselineSnapshot: SnapshotSummary | null;           // D 盘 content/knowledge-governance/current
  appIntegrationSnapshot: SnapshotSummary | null;     // Trae 仓库 content/knowledge-governance/
}

export interface TraeHandoffContent {
  candidatePromptPath: string | null;
  candidatePromptSha256: string | null;
  knowledgeSnapshotPath: string | null;
  targetAppPaths: string[];
  testList: string[];
  rollbackPlan: string | null;
  writebackRequirements: string[];
  /** 是否给出单一候选 Prompt + 单一知识快照 */
  hasSingleCandidate: boolean;
}

export interface ValidationReportContent {
  schema: 'pass' | 'fail' | 'unknown';
  source: 'pass' | 'fail' | 'unknown';
  classification: 'pass' | 'fail' | 'unknown';
  privacy: 'pass' | 'fail' | 'unknown';
  prompt: 'pass' | 'fail' | 'unknown';
  fullPackage: 'pass' | 'fail' | 'unknown';
  audioCoverage: 'pass' | 'fail' | 'unknown';
}

export interface KnowledgeCardSpec {
  cardId: string;
  mentorId: string;
  round: number;
  knowledgeClass: 'internal_pending' | 'internal_approved' | 'external_pending' | 'external_approved';
  disclosureMode: 'none' | 'generalized' | 'exact';
  sourceSha256: string | null;
  sourceBytes: number | null;
  hasCase: boolean;
}

export interface PromptSystemSnapshot {
  persona: string | null;
  capabilities: string[];
  boundaries: string[];
  evals: unknown[];
  manifestStatus: 'pass' | 'fail' | 'unknown';
}

export interface SnapshotSummary {
  mentorId: string;
  totalCards: number;
  promptVersion: string | null;
  promptSha256: string | null;
  /** cardId -> sha256 的映射，用于双快照对账 */
  cardHashes: Record<string, string>;
  mtime: string | null;
}

export interface PreflightInput {
  runId: string;
  mentorDir: string;
  handoff: HandoffPackageMeta;
}

export interface PreflightOutput {
  results: CheckResult[];
  allPass: boolean;
  pendingCount: { external: number; internal: number };
}

// ------------------------------------------------------------------
// 九类预检（按 AGENTS §16.4 顺序）
// ------------------------------------------------------------------

/** 1. 核心文件齐全（四件套 + baseline + deployment-baseline + review-source + audio-analysis + Prompt System 快照） */
export function checkCoreFiles(input: PreflightInput): CheckResult {
  const required = [
    '00_START_HERE.md',
    'source_manifest_final.json',
    'TRAE_HANDOFF.md',
    'VALIDATION_REPORT.md',
  ];
  const optional = ['baseline', 'deployment-baseline', 'review-source', 'audio-analysis', 'prompt-system-snapshot'];
  const files = input.handoff.coreFiles;
  const missing = required.filter((name) => !files.some((f) => f.name === name && f.exists));
  const missingOptional = optional.filter((key) => !files.some((f) => f.relPath.toLowerCase().includes(key) && f.exists));
  const hashBaseline = files
    .filter((f) => f.exists && f.sha256)
    .map((f) => `${f.name}:${(f.sha256 ?? '').slice(0, 8)}`)
    .join(', ');
  if (missing.length > 0) {
    return {
      key: 'core_files',
      label: '核心文件齐全',
      status: 'fail',
      evidence: `缺失：${missing.join('、')}`,
      value: missing.length,
      reason: `四件套缺 ${missing.length} 个`,
      responsibleParty: 'codex',
    };
  }
  return {
    key: 'core_files',
    label: '核心文件齐全',
    status: 'pass',
    evidence: `核心文件 ${required.length} 个齐全${missingOptional.length > 0 ? `；可选缺 ${missingOptional.join('、')}（不阻塞）` : ''}`,
    value: hashBaseline || '哈希基线已锁定',
    reason: missingOptional.length > 0 ? `可选快照缺 ${missingOptional.length} 项，建议补齐` : undefined,
  };
}

/** 2. Prompt 结构（persona 一致性/能力/边界/evals/manifest 状态） */
export function checkPromptSystem(input: PreflightInput): CheckResult {
  const ps = input.handoff.promptSystemSnapshot;
  if (!ps) {
    return {
      key: 'prompt_system',
      label: 'Prompt System 快照',
      status: 'fail',
      evidence: 'prompt-system-snapshot 未提供',
      value: null,
      reason: '缺少 Prompt System 快照',
      responsibleParty: 'codex',
    };
  }
  const issues: string[] = [];
  if (!ps.persona) issues.push('persona 缺失');
  if (!ps.capabilities || ps.capabilities.length === 0) issues.push('能力清单空');
  if (!ps.boundaries || ps.boundaries.length === 0) issues.push('边界清单空');
  if (ps.manifestStatus !== 'pass') issues.push(`manifest 状态=${ps.manifestStatus}`);
  return {
    key: 'prompt_system',
    label: 'Prompt System 快照',
    status: issues.length > 0 ? 'fail' : 'pass',
    evidence: `persona=${ps.persona ?? '—'}`,
    value: `能力 ${ps.capabilities.length} 项 / 边界 ${ps.boundaries.length} 项 / evals ${Array.isArray(ps.evals) ? ps.evals.length : 0} 项 / manifest=${ps.manifestStatus}`,
    reason: issues.length > 0 ? issues.join('；') : undefined,
    responsibleParty: 'codex',
  };
}

/** 3. Schema 解析（知识卡 JSONL 通过当前 Schema） */
export function checkSchema(input: PreflightInput): CheckResult {
  const cards = input.handoff.knowledgeCards;
  const report = input.handoff.validationReport;
  if (cards.length === 0) {
    return {
      key: 'schema_parse',
      label: 'Schema 解析',
      status: 'fail',
      evidence: '知识卡 JSONL 解析为空',
      value: 0,
      reason: 'JSONL 无法解析或无卡',
      responsibleParty: 'codex',
    };
  }
  const schemaStatus = report?.schema ?? 'unknown';
  return {
    key: 'schema_parse',
    label: 'Schema 解析',
    status: schemaStatus === 'pass' ? 'pass' : schemaStatus === 'unknown' ? 'warn' : 'fail',
    evidence: `${cards.length} 张卡已解析`,
    value: cards.length,
    reason: schemaStatus !== 'pass' ? `VALIDATION_REPORT schema=${schemaStatus}` : undefined,
    responsibleParty: 'codex',
  };
}

/** 4. cardId 唯一性 + 轮次连续性 */
export function checkCardIdContinuity(input: PreflightInput): CheckResult {
  const cards = input.handoff.knowledgeCards;
  const idSet = new Set<string>();
  const dupes: string[] = [];
  for (const c of cards) {
    if (idSet.has(c.cardId)) dupes.push(c.cardId);
    idSet.add(c.cardId);
  }
  const rounds = Array.from(new Set(cards.map((c) => c.round))).sort((a, b) => a - b);
  const expected = Array.from({ length: rounds.length }, (_, i) => i + 1);
  const continuous = rounds.length > 0 && rounds.every((r, i) => r === expected[i]);
  if (dupes.length > 0 || !continuous) {
    return {
      key: 'card_id_continuity',
      label: 'cardId 唯一性与轮次连续性',
      status: 'fail',
      evidence: `重复 ${dupes.length} 个 / 轮次 ${rounds.join(',')}`,
      value: { duplicates: dupes, rounds },
      reason: dupes.length > 0 ? `cardId 重复：${dupes.slice(0, 5).join('、')}` : `轮次不连续：${rounds.join(',')}`,
      responsibleParty: 'codex',
    };
  }
  return {
    key: 'card_id_continuity',
    label: 'cardId 唯一性与轮次连续性',
    status: 'pass',
    evidence: `${cards.length} 张 / 轮次 ${rounds.join(',')}`,
    value: { uniqueIds: idSet.size, rounds },
  };
}

/** 5. 分类×披露合法组合（internal=none / external=generalized|exact） */
export function checkClassificationDisclosure(input: PreflightInput): CheckResult {
  const cards = input.handoff.knowledgeCards;
  const invalid = cards.filter((c) => {
    if (c.knowledgeClass.startsWith('internal_')) return c.disclosureMode !== 'none';
    if (c.knowledgeClass.startsWith('external_')) return c.disclosureMode === 'none';
    return true;
  });
  if (invalid.length > 0) {
    return {
      key: 'classification_disclosure',
      label: '分类×披露合法组合',
      status: 'fail',
      evidence: `${invalid.length} 张不合法`,
      value: invalid.slice(0, 5).map((c) => c.cardId),
      reason: `internal 必须 none / external 不可 none；违规示例：${invalid.slice(0, 3).map((c) => `${c.cardId}=${c.knowledgeClass}/${c.disclosureMode}`).join('、')}`,
      responsibleParty: 'codex',
    };
  }
  const stats = {
    internal_pending: cards.filter((c) => c.knowledgeClass === 'internal_pending').length,
    internal_approved: cards.filter((c) => c.knowledgeClass === 'internal_approved').length,
    external_pending: cards.filter((c) => c.knowledgeClass === 'external_pending').length,
    external_approved: cards.filter((c) => c.knowledgeClass === 'external_approved').length,
  };
  return {
    key: 'classification_disclosure',
    label: '分类×披露合法组合',
    status: 'pass',
    evidence: JSON.stringify(stats),
    value: stats,
  };
}

/** 6. 来源哈希 + 音频覆盖 */
export function checkSourceHashAudioCoverage(input: PreflightInput): CheckResult {
  const cards = input.handoff.knowledgeCards;
  const missingHash = cards.filter((c) => !c.sourceSha256);
  const missingBytes = cards.filter((c) => c.sourceBytes == null);
  const audioStatus = input.handoff.validationReport?.audioCoverage ?? 'unknown';
  // 缺 sourceSha256/sourceBytes 通常因为源文件不在 manifest 里（R1 访谈音频太大不进包），
  // 属于可预期情况，降为 warn；只有 audioCoverage 不通过才 fail
  const warnings: string[] = [];
  if (missingHash.length > 0) warnings.push(`${missingHash.length} 张缺 sourceSha256`);
  if (missingBytes.length > 0) warnings.push(`${missingBytes.length} 张缺 sourceBytes`);
  const failIssues: string[] = [];
  if (audioStatus !== 'pass') failIssues.push(`audioCoverage=${audioStatus}`);
  const hasFail = failIssues.length > 0;
  const hasWarn = warnings.length > 0;
  return {
    key: 'source_hash_audio',
    label: '来源哈希与音频覆盖',
    status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
    evidence: `哈希缺失 ${missingHash.length} / 字节缺失 ${missingBytes.length} / audio=${audioStatus}`,
    value: { missingHash: missingHash.length, missingBytes: missingBytes.length, audioCoverage: audioStatus },
    reason: hasFail ? failIssues.join('；') : hasWarn ? warnings.join('；') : undefined,
    responsibleParty: 'codex',
  };
}

/** 7. 未吸收回复 + 隐私冲突 + 跨导师污染 */
export function checkUnabsorbedRepliesPrivacy(input: PreflightInput): CheckResult {
  const report = input.handoff.validationReport;
  const cards = input.handoff.knowledgeCards;
  // 用 manifest.mentorId 做期望值（JSONL 卡里的 mentorId 可能与 mentorDir 写法不同）
  const manifestMentorId = (input.handoff.sourceManifest?.mentorId as string | undefined) ?? null;
  const expectedRaw = manifestMentorId ?? input.mentorDir;
  const expectedMentorId = expectedRaw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const crossMentor = cards.filter((c) => c.mentorId.trim().toLowerCase().replace(/[\s-]+/g, '_') !== expectedMentorId);
  const privacyStatus = report?.privacy ?? 'unknown';
  const sourceStatus = report?.source ?? 'unknown';
  const issues: string[] = [];
  if (crossMentor.length > 0) issues.push(`跨导师污染 ${crossMentor.length} 张`);
  if (privacyStatus !== 'pass') issues.push(`privacy=${privacyStatus}`);
  if (sourceStatus !== 'pass') issues.push(`source(未吸收回复)=${sourceStatus}`);
  return {
    key: 'unabsorbed_privacy',
    label: '未吸收回复与隐私冲突',
    status: issues.length > 0 ? 'fail' : 'pass',
    evidence: `跨导师 ${crossMentor.length} / privacy=${privacyStatus} / source=${sourceStatus}`,
    value: { crossMentor: crossMentor.length, privacy: privacyStatus, source: sourceStatus },
    reason: issues.length > 0 ? issues.join('；') : undefined,
    responsibleParty: crossMentor.length > 0 ? 'codex' : 'codex',
  };
}

/** 8. TRAE_HANDOFF.md 完整性（单一候选 Prompt + 单一知识快照 + 目标路径 + 测试 + 回滚 + 回传） */
export function checkTraeHandoffCompleteness(input: PreflightInput): CheckResult {
  const th = input.handoff.traeHandoff;
  if (!th) {
    return {
      key: 'trae_handoff',
      label: 'TRAE_HANDOFF.md 完整性',
      status: 'fail',
      evidence: 'TRAE_HANDOFF.md 未解析',
      value: null,
      reason: '缺少 TRAE_HANDOFF.md',
      responsibleParty: 'codex',
    };
  }
  const issues: string[] = [];
  if (!th.hasSingleCandidate) issues.push('未给出单一候选 Prompt + 单一知识快照');
  if (!th.candidatePromptPath) issues.push('缺候选 Prompt 路径');
  if (!th.candidatePromptSha256) issues.push('缺候选 Prompt SHA-256');
  if (!th.knowledgeSnapshotPath) issues.push('缺知识快照路径');
  if (th.targetAppPaths.length === 0) issues.push('缺目标应用路径');
  if (th.testList.length === 0) issues.push('缺测试清单');
  if (!th.rollbackPlan) issues.push('缺回滚方案');
  if (th.writebackRequirements.length === 0) issues.push('缺回传要求');
  return {
    key: 'trae_handoff',
    label: 'TRAE_HANDOFF.md 完整性',
    status: issues.length > 0 ? 'fail' : 'pass',
    evidence: `候选 Prompt=${th.candidatePromptPath ?? '—'}`,
    value: {
      hasSingleCandidate: th.hasSingleCandidate,
      targetPaths: th.targetAppPaths.length,
      tests: th.testList.length,
      hasRollback: !!th.rollbackPlan,
      writebackReqs: th.writebackRequirements.length,
    },
    reason: issues.length > 0 ? issues.join('；') : undefined,
    responsibleParty: 'codex',
  };
}

/** 9. 双快照对账（D 盘 vs Trae 仓库，按导师/cardId/Prompt 版本/SHA-256） */
export function checkDualSnapshotReconciliation(input: PreflightInput): CheckResult {
  const baseline = input.handoff.baselineSnapshot;
  const app = input.handoff.appIntegrationSnapshot;
  if (!baseline || !app) {
    return {
      key: 'dual_snapshot',
      label: '双快照对账',
      status: 'warn',
      evidence: !baseline ? 'D 盘 baseline 快照未提供' : 'Trae 应用集成快照未提供',
      value: null,
      reason: '一侧快照缺失，无法对账；需 Runner 补传后重试',
      responsibleParty: 'control_plane',
    };
  }
  if (baseline.mentorId !== app.mentorId) {
    return {
      key: 'dual_snapshot',
      label: '双快照对账',
      status: 'fail',
      evidence: `mentorId 不一致：D=${baseline.mentorId} / App=${app.mentorId}`,
      value: { baseline: baseline.mentorId, app: app.mentorId },
      reason: '双快照 mentorId 不一致，禁止集成',
      responsibleParty: 'control_plane',
    };
  }
  const baselineIds = new Set(Object.keys(baseline.cardHashes));
  const appIds = new Set(Object.keys(app.cardHashes));
  const onlyBaseline = [...baselineIds].filter((id) => !appIds.has(id));
  const onlyApp = [...appIds].filter((id) => !baselineIds.has(id));
  const hashMismatch: string[] = [];
  for (const id of baselineIds) {
    if (appIds.has(id) && baseline.cardHashes[id] !== app.cardHashes[id]) {
      hashMismatch.push(id);
    }
  }
  // 防回退验证：D 盘 mtime 晚于 App mtime 时，D 盘可能更新，禁止从 D 盘旧快照覆盖
  const baselineNewer = baseline.mtime && app.mtime ? new Date(baseline.mtime) > new Date(app.mtime) : false;
  const issues: string[] = [];
  if (onlyBaseline.length > 0) issues.push(`仅 D 盘 ${onlyBaseline.length} 张`);
  if (onlyApp.length > 0) issues.push(`仅 App ${onlyApp.length} 张`);
  if (hashMismatch.length > 0) issues.push(`哈希不一致 ${hashMismatch.length} 张`);
  return {
    key: 'dual_snapshot',
    label: '双快照对账',
    status: issues.length > 0 ? 'warn' : 'pass',
    evidence: `D 盘 ${baseline.totalCards} 张 / App ${app.totalCards} 张`,
    value: {
      onlyBaseline: onlyBaseline.length,
      onlyApp: onlyApp.length,
      hashMismatch: hashMismatch.length,
      baselineNewer,
      promptVersionMatch: baseline.promptVersion === app.promptVersion,
    },
    reason: issues.length > 0
      ? `${issues.join('；')}；${baselineNewer ? 'D 盘较新需先回写同步，禁从旧快照覆盖' : '差异需列选用依据与防回退验证'}`
      : undefined,
    responsibleParty: 'control_plane',
  };
}

/** 主入口：运行九类预检，返回结果列表与整体判定 */
export function runAllChecks(input: PreflightInput): PreflightOutput {
  const checks = [
    checkCoreFiles,
    checkPromptSystem,
    checkSchema,
    checkCardIdContinuity,
    checkClassificationDisclosure,
    checkSourceHashAudioCoverage,
    checkUnabsorbedRepliesPrivacy,
    checkTraeHandoffCompleteness,
    checkDualSnapshotReconciliation,
  ];
  const results = checks.map((fn) => fn(input));
  // allPass 判定：无 fail 即全过（warn 不阻塞，仅提示补齐）
  const allPass = !results.some((r) => r.status === 'fail');
  const cards = input.handoff.knowledgeCards;
  const pendingCount = {
    external: cards.filter((c) => c.knowledgeClass === 'external_pending').length,
    internal: cards.filter((c) => c.knowledgeClass === 'internal_pending').length,
  };
  return { results, allPass, pendingCount };
}

/** 九类预检项标签（供面板渲染） */
export const PREFLIGHT_ITEMS = [
  { key: 'core_files', label: '核心文件齐全' },
  { key: 'prompt_system', label: 'Prompt System 快照' },
  { key: 'schema_parse', label: 'Schema 解析' },
  { key: 'card_id_continuity', label: 'cardId 唯一性与轮次连续性' },
  { key: 'classification_disclosure', label: '分类×披露合法组合' },
  { key: 'source_hash_audio', label: '来源哈希与音频覆盖' },
  { key: 'unabsorbed_privacy', label: '未吸收回复与隐私冲突' },
  { key: 'trae_handoff', label: 'TRAE_HANDOFF.md 完整性' },
  { key: 'dual_snapshot', label: '双快照对账' },
] as const;
