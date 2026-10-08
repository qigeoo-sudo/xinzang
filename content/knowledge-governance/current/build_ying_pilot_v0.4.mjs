import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = 'D:/database/mentors/ying wang/work/ying-final-handoff-v0.4';
const PILOT_ROOT = 'D:/database/mentors/ying wang pilot';
const PILOT_V03 = `${PILOT_ROOT}/work/ying-pilot-v0.3`;
const OUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, 'outputs', 'Ying_Wang_Pilot_Final_Handoff_v0.4_2026-10-08');

const read = (p) => fs.readFileSync(p, 'utf8');
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const write = (rel, data) => {
  const p = path.join(OUT, rel);
  mkdir(path.dirname(p));
  fs.writeFileSync(p, data);
};
const copy = (src, rel) => {
  const p = path.join(OUT, rel);
  mkdir(path.dirname(p));
  fs.copyFileSync(src, p);
};
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const bytes = (p) => fs.statSync(p).size;
const json = (value) => JSON.stringify(value, null, 2) + '\n';

if (!fs.existsSync(SOURCE)) throw new Error(`Missing canonical source: ${SOURCE}`);
if (!fs.existsSync(PILOT_V03)) throw new Error(`Missing Pilot baseline: ${PILOT_V03}`);
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
mkdir(OUT);

const replacements = [
  [/ying-final-handoff-v0\.4/g, 'ying-pilot-final-handoff-v0.4'],
  [/Ying_Wang_分身SystemPrompt_candidate_v0\.4\.md/g, 'Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.4.md'],
  [/Ying_Wang_第二轮覆盖与更新审计_v0\.2\.md/g, 'Ying_Wang_Pilot_第二轮覆盖与更新审计_v0.2.md'],
  [/Ying_Wang_第二轮审核吸收与最终交接审计_v0\.3\.md/g, 'Ying_Wang_Pilot_第二轮审核吸收与最终交接审计_v0.3.md'],
  [/Ying_Wang_语言人格风格更新_v0\.2\.md/g, 'Ying_Wang_Pilot_语言人格风格更新_v0.2.md'],
  [/Ying_Wang_第二轮审核清单_v0\.2_回复\.md/g, 'Ying_Wang_Pilot_第二轮审核清单_v0.2_回复.md'],
  [/Ying_Wang_第二轮审核清单_v0\.2\.md/g, 'Ying_Wang_Pilot_第二轮审核清单_v0.2_回复.md'],
  [/ying_r1_r2_knowledge_cards_v0\.3\.jsonl/g, 'ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl'],
  [/ying_public_profile_v0\.1\.json/g, 'ying_pilot_public_profile_v0.1.json'],
  [/ying_audio_full_analysis\.json/g, 'ying_pilot_audio_full_analysis.json'],
  [/ying_audio_internal_asr\.txt/g, 'ying_pilot_audio_internal_asr.txt'],
  [/ying_audio_style_metrics\.json/g, 'ying_pilot_audio_style_metrics.json'],
  [/mentor:ying(?!-pilot)/g, 'mentor:ying-pilot'],
  [/mentors\/ying\//g, 'mentors/ying-pilot/'],
  [/YIN-/g, 'YWP-'],
  [/YW-R/g, 'YWP-R'],
  [/"mentorId": "ying"/g, '"mentorId": "ying-pilot"'],
  [/"id": "ying"/g, '"id": "ying-pilot"'],
  [/"publicName": "Ying Wang"/g, '"publicName": "Ying Wang Pilot"'],
  [/ying wang word\/ying 第二轮 interview word/g, 'ying wang pilot word/ying wang pilot 第二轮 interview word'],
  [/ying wang audio\/ying 第二轮 interview audio/g, 'ying wang pilot audio/ying wang pilot 第二轮 interview audio'],
  [/mentors\/ying wang\//g, 'mentors/ying wang pilot/'],
];
function transformText(text) {
  let out = text;
  for (const [from, to] of replacements) out = out.replace(from, to);
  return out;
}

// Candidate prompt from the approved formal final handoff, isolated as a Pilot test identity.
let prompt = transformText(read(path.join(SOURCE, 'Ying_Wang_分身SystemPrompt_candidate_v0.4.md')));
prompt = prompt.replace(/^#\s+Ying Wang/m, '# Ying Wang Pilot');
prompt = prompt.replace(/(^|\n)(你是|我是)\s*Ying Wang/m, '$1$2 Ying Wang Pilot');
prompt += '\n\n## Pilot 测试隔离\n\n这是 Ying Wang 正式 final handoff 的测试克隆。运行时必须使用 `mentor:ying-pilot` 命名空间；不得读取、写入或冒充 `mentor:ying` 正式实例，也不得把测试对话或测试结论回写到正式导师资产。\n';
write('Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.4.md', prompt);
write('prompt-system/mentors/ying-pilot/persona.md', prompt);

// Knowledge cards: preserve reviewed content and governance, switch only identity/source namespaces.
const cardLines = read(path.join(SOURCE, 'ying_r1_r2_knowledge_cards_v0.3.jsonl')).trim().split(/\r?\n/);
const cards = cardLines.map((line) => {
  const card = JSON.parse(line);
  card.cardId = card.cardId.replace(/^YIN-/, 'YWP-');
  card.mentorId = 'ying-pilot';
  card.source = card.source.map((s) => s.replace(/^YW-R/, 'YWP-R'));
  return card;
});
write('ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl', cards.map((c) => JSON.stringify(c)).join('\n') + '\n');

// Public profile remains test-only even though the reviewed source fields are retained.
const profile = JSON.parse(read(path.join(SOURCE, 'ying_public_profile_v0.1.json')));
profile.mentorId = 'ying-pilot';
profile.displayName = 'Ying Wang Pilot';
profile.publicationAuthorized = false;
profile.testOnly = true;
profile.restrictions = [
  '仅用于 Pilot 测试；不得作为 Ying Wang 正式公开档案发布',
  ...profile.restrictions,
  '不得跨读写 mentor:ying 正式命名空间'
];
profile.sources = profile.sources.map((s) => s.replace(/^YW-R/, 'YWP-R'));
write('ying_pilot_public_profile_v0.1.json', json(profile));

// Human-facing analyses are cloned from the formal final handoff with Pilot identifiers.
for (const [src, dst, title] of [
  ['Ying_Wang_第二轮覆盖与更新审计_v0.2.md', 'Ying_Wang_Pilot_第二轮覆盖与更新审计_v0.2.md', 'Ying Wang Pilot 第二轮覆盖与更新审计'],
  ['Ying_Wang_第二轮审核吸收与最终交接审计_v0.3.md', 'Ying_Wang_Pilot_第二轮审核吸收与最终交接审计_v0.3.md', 'Ying Wang Pilot 第二轮审核吸收与最终交接审计'],
  ['Ying_Wang_语言人格风格更新_v0.2.md', 'Ying_Wang_Pilot_语言人格风格更新_v0.2.md', 'Ying Wang Pilot 语言人格风格更新'],
]) {
  let body = transformText(read(path.join(SOURCE, src)));
  body = body.replace(/^# .*$/m, `# ${title}`);
  body = `> 测试克隆说明：内容来自正式 Ying Wang final handoff；本文件仅服务于 ying-pilot 隔离测试。\n\n${body}`;
  write(dst, body);
}

// Prompt System files.
for (const name of ['capability.json', 'boundary-responses.json']) {
  const obj = JSON.parse(transformText(read(path.join(SOURCE, 'prompt-system/mentors/ying', name))));
  if (obj.mentorId) obj.mentorId = 'ying-pilot';
  if (obj.version) obj.version = '0.4.0';
  if (obj.knowledgeNamespace) obj.knowledgeNamespace = 'mentor:ying-pilot';
  if (obj.routerExamplesRef) obj.routerExamplesRef = 'mentors/ying-pilot/evals.md';
  write(`prompt-system/mentors/ying-pilot/${name}`, json(obj));
}
let evals = transformText(read(path.join(SOURCE, 'prompt-system/mentors/ying/evals.md')));
evals = evals.replace(/^# .*$/m, '# Ying Wang Pilot Evals');
evals = `> 测试克隆：所有检索与断言须限定于 mentor:ying-pilot。\n\n${evals}`;
write('prompt-system/mentors/ying-pilot/evals.md', evals);

const pilotManifestV03 = JSON.parse(read(path.join(PILOT_V03, 'prompt-system/mentors/ying-pilot/manifest.json')));
const manifest = JSON.parse(transformText(read(path.join(SOURCE, 'prompt-system/mentors/ying/manifest.json'))));
manifest.id = 'ying-pilot';
manifest.publicName = 'Ying Wang Pilot';
manifest.version = '0.4.0';
manifest.status = 'draft';
manifest.promptAssembly = manifest.promptAssembly.map((p) => p.replace('mentors/ying/', 'mentors/ying-pilot/'));
manifest.knowledgeNamespace = 'mentor:ying-pilot';
manifest.legacySources = [
  ...pilotManifestV03.legacySources.filter((p) => !p.includes('第二轮审核清单')),
  'mentors/ying wang pilot/Ying_Wang_第二轮审核清单_v0.2_回复.md'
];
write('prompt-system/mentors/ying-pilot/manifest.json', json(manifest));

// Audio analysis is reused as a mechanical test clone; source files themselves are separately hash-validated.
for (const [src, dst] of [
  ['ying_audio_full_analysis.json', 'ying_pilot_audio_full_analysis.json'],
  ['ying_audio_style_metrics.json', 'ying_pilot_audio_style_metrics.json'],
]) {
  const obj = JSON.parse(transformText(read(path.join(SOURCE, 'audio-analysis', src))));
  obj.mentorId = 'ying-pilot';
  obj.testClone = true;
  obj.analysisReusedFromApprovedFinalHandoff = true;
  write(`audio-analysis/${dst}`, json(obj));
}
const asr = read(path.join(SOURCE, 'audio-analysis/ying_audio_internal_asr.txt'));
write('audio-analysis/ying_pilot_audio_internal_asr.txt', '[Pilot 测试克隆：复用正式 final handoff 的内部 ASR，仅用于覆盖和风格校对，不作为事实源。]\n\n' + asr);

// Preserve the actual Pilot v0.3 candidate as rollback/comparison baseline.
copy(path.join(PILOT_V03, 'ying_pilot_r1_r2_knowledge_cards_v0.2.jsonl'), 'baseline/ying_pilot_r1_r2_knowledge_cards_v0.2.jsonl');
copy(path.join(PILOT_V03, 'Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.3.md'), 'baseline/Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.3.md');

// Deployment baseline snapshots retained for handoff structure; they remain non-deployed test references.
for (const rel of ['MATERIAL_COVERAGE.md', 'README.md', 'prompts/manifest.json', 'prompts/README.md']) {
  let body = transformText(read(path.join(SOURCE, 'deployment-baseline', rel)));
  body = `测试克隆快照：不得据此自动修改 production current。\n\n${body}`;
  write(`deployment-baseline/${rel}`, body);
}

// Preserve the received Pilot review reply byte-for-byte in review-source.
const r2Review = `${PILOT_ROOT}/Ying_Wang_第二轮审核清单_v0.2_回复.md`;
copy(r2Review, 'review-source/Ying_Wang_Pilot_第二轮审核清单_v0.2_回复.md');

const sourceDefs = [
  ['YWP-R1-REVIEW', 'mentor_review', 'Ying_Wang_第一轮审核清单_v0.1_回复.md'],
  ['YWP-R2-REVIEW', 'mentor_review', 'Ying_Wang_第二轮审核清单_v0.2_回复.md'],
  ['YWP-R2-Q1', 'transcript', 'ying wang pilot word/ying wang pilot 第二轮 interview word/第二季Q1.txt'],
  ['YWP-R2-Q2Q3', 'transcript', 'ying wang pilot word/ying wang pilot 第二轮 interview word/第二季Q2_Q3.txt'],
  ['YWP-R2-Q4Q6', 'transcript', 'ying wang pilot word/ying wang pilot 第二轮 interview word/第二季Q4.txt'],
  ['YWP-R2-AUDIO-Q1', 'audio', 'ying wang pilot audio/ying wang pilot 第二轮 interview audio/第二季Q1.m4a', 806.90],
  ['YWP-R2-AUDIO-Q2Q3', 'audio', 'ying wang pilot audio/ying wang pilot 第二轮 interview audio/第二季Q2_Q3.m4a', 1809.26],
  ['YWP-R2-AUDIO-Q4Q6', 'audio', 'ying wang pilot audio/ying wang pilot 第二轮 interview audio/第二季Q4.m4a', 1703.08],
];
const sources = sourceDefs.map(([sourceId, sourceType, relativePath, durationSec]) => {
  const p = path.join(PILOT_ROOT, relativePath);
  const item = { sourceId, sourceType, relativePath, bytes: bytes(p), sha256: sha256(p) };
  if (durationSec !== undefined) item.durationSec = durationSec;
  return item;
});
const sourceManifest = {
  schemaVersion: '1.0', mentorId: 'ying-pilot', round: 2, generatedAt: '2026-10-08',
  sourceRoot: PILOT_ROOT.replaceAll('/', '\\'), testClone: true,
  factPriority: ['本人第二轮书面审核回复', '本人第一轮书面审核回复', '第二轮人工文字稿', '第二轮原始音频', '派生ASR与声学统计'],
  sources, audioTotalDurationSec: 4319.24,
  notes: ['本包为正式 final handoff 的隔离测试克隆。', '人工文字稿为事实主源；音频与派生分析仅用于完整性和风格校对。', '所有运行时检索必须限定于 mentor:ying-pilot。']
};
write('source_manifest_final.json', json(sourceManifest));

const counts = {
  total: cards.length,
  r1: cards.filter((c) => c.cardId.startsWith('YWP-R1-')).length,
  r2: cards.filter((c) => c.cardId.startsWith('YWP-R2-')).length,
  external: cards.filter((c) => c.knowledgeClass === 'external_approved').length,
  internal: cards.filter((c) => c.knowledgeClass === 'internal_approved').length,
  exact: cards.filter((c) => c.disclosureMode === 'exact').length,
  generalized: cards.filter((c) => c.disclosureMode === 'generalized').length,
  none: cards.filter((c) => c.disclosureMode === 'none').length,
  pending: cards.filter((c) => c.knowledgeClass.endsWith('_pending')).length,
  formalCases: cards.filter((c) => c.caseText !== null).length,
};

const readme = `# Ying Wang Pilot final handoff v0.4\n\n## 用途\n\n这是测试包。它以正式 \`ying-final-handoff-v0.4\` 为唯一内容基线，将第二轮书面审核已吸收后的 Prompt、知识卡与 Prompt System 资产机械克隆到独立的 \`ying-pilot\` 身份与命名空间。未重新解释或扩写访谈事实。\n\n## 版本与状态\n\n- assembly：\`ying-pilot-final-handoff-v0.4\`\n- Prompt：candidate v0.4\n- 知识卡：v0.3\n- public profile：v0.1，\`testOnly=true\`，禁止公开发布\n- Prompt System：v0.4.0，\`draft\`\n- production current：保持不变\n\n## 卡片状态\n\n- 总数：${counts.total}（R1 ${counts.r1}；R2 ${counts.r2}）\n- \`external_approved\`：${counts.external}\n- \`internal_approved\`：${counts.internal}\n- disclosure：exact ${counts.exact} / generalized ${counts.generalized} / none ${counts.none}\n- pending：${counts.pending}\n- formal case：${counts.formalCases}\n\n普通用户回答只能检索 \`external_approved\`；3 张 \`internal_approved + none\` 卡只用于系统内部控制。\n\n## 来源与音频\n\n- 已登记并哈希校验 8 个独立输入：两份审核回复、三份第二轮人工文字稿、三份第二轮完整音频。\n- 第二轮音频总时长：4319.24 秒。\n- \`review-source/\` 中的第二轮回复与 Pilot 根目录原件逐字节一致。\n- 音频分析文件按测试要求复用正式 final handoff，不重新分析录音。\n\n## 入口\n\n- Prompt：\`Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.4.md\`\n- 卡片：\`ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl\`\n- 最终审核吸收审计：\`Ying_Wang_Pilot_第二轮审核吸收与最终交接审计_v0.3.md\`\n- 集成交接：\`TRAE_HANDOFF.md\`\n- 验证结果：\`VALIDATION_REPORT.md\`\n\n## 下一道门\n\n本包只完成测试克隆与最终交接准备，不自动部署。集成前仍需按 \`TRAE_HANDOFF.md\` 做部署时备份、schema 校验、检索隔离与回归测试。\n`;
write('00_START_HERE.md', readme);

const handoff = `# TRAE handoff — Ying Wang Pilot final v0.4\n\n## 单一候选源\n\n- Prompt：\`Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.4.md\`\n- 知识：\`ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl\`\n- Prompt System：\`prompt-system/mentors/ying-pilot/\`\n\n## 测试目标（不要在本 assembly 阶段执行）\n\n- 仅集成到 \`mentor:ying-pilot\`。\n- 不得替换、写入或回流至 \`mentor:ying\`。\n- 不得自动修改 \`knowledge-governance/current\`；部署动作必须另行批准。\n\n## 加载顺序\n\n1. 全局导师系统政策。\n2. Ying Wang Pilot persona。\n3. 仅限 \`knowledgeClass=external_approved\` 的合格知识上下文。\n4. 当前对话上下文。\n\n必须排除 \`internal_approved\` 和全部 pending 卡。内部卡 \`YWP-R2-014\`、\`YWP-R2-025\`、\`YWP-R2-027\` 不得出现在用户可见回答中。\n\n## 部署时要求\n\n1. 在部署目标处创建带时间戳的备份，并记录 before hash。\n2. 校验全部 JSON/JSONL schema、ID 唯一性、R2 连续性、来源 hash 与 Prompt/persona 字节一致性。\n3. 生产过滤器只能放行 \`external_approved\`；不得依赖字符串中含有 “approved”。\n4. 以部署时全语料重算 mentor/card/class/disclosure 数量，不使用静态旧计数。\n5. 回归至少覆盖：阶段化建议、领域路由、高影响决定、隐私、精确字段不扩写、内部卡泄漏、无卡、过期、冲突、跨导师、风格保真、formal-case 不捏造。\n6. 验证 \`mentor:ying-pilot\` 与 \`mentor:ying\` 双向隔离。\n7. 保留一键回滚路径并实测。\n\n## 验收回执\n\n集成者须回传：before/after hashes、schema 结果、全库计数、回归结果、内部卡泄漏结果、跨导师隔离结果、最终 metadata、回滚状态。\n`;
write('TRAE_HANDOFF.md', handoff);

const validator = `import fs from 'node:fs';\nimport path from 'node:path';\nimport crypto from 'node:crypto';\nimport { fileURLToPath } from 'node:url';\nconst root=path.dirname(fileURLToPath(import.meta.url));\nconst pilot='D:/database/mentors/ying wang pilot';\nconst ok=(v,m)=>{if(!v)throw new Error(m)};\nconst read=(p)=>fs.readFileSync(p,'utf8');\nconst hash=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();\nconst cards=read(path.join(root,'ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl')).trim().split(/\\r?\\n/).map(JSON.parse);\nok(cards.length===92,'card total');\nok(new Set(cards.map(c=>c.cardId)).size===92,'unique ids');\nok(cards.every(c=>Object.keys(c).length===20),'20-field schema');\nok(cards.every(c=>c.mentorId==='ying-pilot'),'mentor id');\nok(cards.filter(c=>c.cardId.startsWith('YWP-R1-')).length===65,'R1 count');\nconst r2=cards.filter(c=>c.cardId.startsWith('YWP-R2-'));\nok(r2.length===27,'R2 count');\nok(r2.every((c,i)=>c.cardId===\`YWP-R2-\${String(i+1).padStart(3,'0')}\`),'R2 continuity');\nok(cards.filter(c=>c.knowledgeClass==='external_approved').length===89,'external count');\nok(cards.filter(c=>c.knowledgeClass==='internal_approved').length===3,'internal count');\nok(cards.filter(c=>c.knowledgeClass.endsWith('_pending')).length===0,'pending zero');\nok(cards.filter(c=>c.disclosureMode==='exact').length===7,'exact count');\nok(cards.filter(c=>c.disclosureMode==='generalized').length===82,'generalized count');\nok(cards.filter(c=>c.disclosureMode==='none').length===3,'none count');\nok(cards.filter(c=>c.caseText!==null).length===0,'formal case zero');\nok(cards.filter(c=>c.knowledgeClass==='internal_approved').every(c=>c.disclosureMode==='none'),'internal disclosure');\nok(cards.every(c=>!c.cardId.startsWith('YIN-')),'no formal ids');\nconst prompt=path.join(root,'Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.4.md');\nconst persona=path.join(root,'prompt-system/mentors/ying-pilot/persona.md');\nok(hash(prompt)===hash(persona),'prompt/persona identity');\nconst mf=JSON.parse(read(path.join(root,'prompt-system/mentors/ying-pilot/manifest.json')));\nok(mf.id==='ying-pilot'&&mf.version==='0.4.0'&&mf.status==='draft','prompt manifest');\nok(mf.knowledgeNamespace==='mentor:ying-pilot','namespace');\nconst profile=JSON.parse(read(path.join(root,'ying_pilot_public_profile_v0.1.json')));\nok(profile.mentorId==='ying-pilot'&&profile.testOnly===true&&profile.publicationAuthorized===false,'test profile');\nconst sm=JSON.parse(read(path.join(root,'source_manifest_final.json')));\nok(sm.sources.length===8,'source count');\nfor(const s of sm.sources){const p=path.join(pilot,s.relativePath);ok(fs.statSync(p).size===s.bytes,\`bytes \${s.sourceId}\`);ok(hash(p)===s.sha256,\`hash \${s.sourceId}\`)}\nconst review=path.join(pilot,'Ying_Wang_第二轮审核清单_v0.2_回复.md');\nok(hash(review)===hash(path.join(root,'review-source/Ying_Wang_Pilot_第二轮审核清单_v0.2_回复.md')),'review snapshot');\nconst rootDirs=fs.readdirSync(pilot,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();\nok(JSON.stringify(rootDirs)===JSON.stringify(['work','ying wang pilot audio','ying wang pilot word'].sort()),'pilot root directories');\nconst handoff=read(path.join(root,'TRAE_HANDOFF.md'));\nok(handoff.includes('knowledgeClass=external_approved')&&handoff.includes('不得自动修改'), 'handoff gates');\nconst files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):files.push(p)}};walk(root);\nok(files.length===27,'core file count');\nconsole.log('PASS ying-pilot-final-handoff-v0.4');\nconsole.log(JSON.stringify({files:files.length,cards:cards.length,r1:65,r2:27,externalApproved:89,internalApproved:3,pending:0,formalCases:0,sources:8,audioDurationSec:sm.audioTotalDurationSec,manifest:mf.status},null,2));\n`;
write('validate_ying_pilot_v0.4.mjs', validator);
copy(fileURLToPath(import.meta.url), 'build_ying_pilot_v0.4.mjs');

const report = `# VALIDATION REPORT — Ying Wang Pilot final handoff v0.4\n\n生成后由 \`validate_ying_pilot_v0.4.mjs\` 执行双位置验证。\n\n## 预期且已编码的质量门\n\n- 文件数：27\n- 卡片：92（R1 65；R2 27）\n- class：external_approved 89；internal_approved 3；pending 0\n- disclosure：exact 7；generalized 82；none 3\n- formal case：0\n- 来源：8，逐项 bytes + SHA-256\n- 第二轮音频：3 个完整文件，总时长 4319.24 秒\n- Prompt 与 persona：字节一致\n- Prompt System：v0.4.0 / draft / mentor:ying-pilot\n- Pilot 根目录结构：work、ying wang pilot audio、ying wang pilot word\n- 第二轮审核回复快照：与 Pilot 原件字节一致\n- production current：未由构建脚本修改\n\n最终执行结果以命令输出为准。\n`;
write('VALIDATION_REPORT.md', report);

console.log(OUT);
console.log(JSON.stringify(counts, null, 2));
