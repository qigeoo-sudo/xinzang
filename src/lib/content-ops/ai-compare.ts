/**
 * S8 第一轮阅览文件 AI 比对（方案 C：控制平面调 DeepSeek）。
 *
 * 评分口径（D:\database\AGENTS.md L168/L588/L590，2026-10-07 人工校对定型）：
 * - 比的是「文档职责、章节层级、证据深度、问题类型」的达标度，
 *   不比事实、经历、语气、结论的表面相似；不同导师事实雷同按「串用」处理。
 * - 试点 Run（isPilot）是同源复制演练，事实相同属预期，改查复制残留：
 *   悬空引用、数字照抄、改头不彻底、复用声明缺失。
 * - 四维各 0-100 整数百分比；任一维 <80 必须给指向章节的具体原因。
 * - 无 API key 直接报错，不降级为机械相似度（机械分会给照抄稿虚高）。
 */

export const COMPARE_DIMENSIONS = [
  { key: 'structure', label: '结构' },
  { key: 'duty', label: '职责' },
  { key: 'density', label: '密度' },
  { key: 'readability', label: '可读性' },
] as const;

export type CompareDimKey = (typeof COMPARE_DIMENSIONS)[number]['key'];

export interface CompareFinding {
  severity: 'block' | 'warn' | 'info';
  chapter: string;
  detail: string;
}

export interface DocCompareResult {
  docType: 'style_analysis' | 'review_checklist';
  relPath: string;
  scores: Record<CompareDimKey, number>;
  reasons: Partial<Record<CompareDimKey, string>>;
  findings: CompareFinding[];
  summary: string;
  model: string;
}

export interface CompareRef {
  refMentor: string;
  relPath: string;
  content: string;
}

export interface CompareInput {
  docType: 'style_analysis' | 'review_checklist';
  mentorDir: string;
  isPilot: boolean;
  candidate: { relPath: string; content: string };
  refs: CompareRef[];
}

export const COMPARE_PASS_LINE = 80;

export function belowLine(r: DocCompareResult, line = COMPARE_PASS_LINE): CompareDimKey[] {
  return COMPARE_DIMENSIONS.map((d) => d.key).filter((k) => r.scores[k] < line);
}

export function allDocsPass(results: DocCompareResult[], line = COMPARE_PASS_LINE): boolean {
  return results.length > 0 && results.every((r) => belowLine(r, line).length === 0);
}

const COMMON_RULES = [
  '你在评的是「文档对规范的达标度」，不是候选与参考的文字表面相似度；严禁用措辞雷同程度打分。',
  '不同导师的事实、经历、行业、语气、结论必须不同；候选若照抄参考导师的事实或案例，按「串用」重扣职责分。',
  '参考只用于确认章节职责、信息层级、证据深度与问题密度；候选的导师专属内容应来自其本人的材料。',
  '四个维度各给 0-100 的整数百分比：80 及以上为达标线；任何一维低于 80，必须在该维 reasons 中写出具体原因并指出问题章节。',
  'findings 只列真问题：block=必须修订才能发送，warn=建议修订，info=可接受但需知晓；没问题就给空数组，不得凑数。',
  '只输出一个 JSON 对象，不要输出 JSON 以外的任何字。',
].join('\n');

const STYLE_RUBRIC = `候选与参考都是导师分身制作流程中的「语言人格风格分析」。按 L588 规范评四维：
- structure 结构：八个必备职责是否齐全且名副其实——①材料与方法 ②完整音频检查及量化表 ③稳定人格与表达特征 ④典型回答组织方式 ⑤语言三层（稳定人格/话题相关/禁止机械模仿，允许换层名但三块职责都要在）⑥Claude/Sonnet 次级分析对照 ⑦对候选Prompt的直接影响 ⑧数据文件与方法限制；允许增加声学/停顿/词汇/英文细表，允许增加额外章，但缺任一必备职责重扣。
- duty 职责：每章是否真正履职——量化指标来源可复核且注明局限、不据声学值推断人格；每条人格特征有原稿依据并有「分身如何保留/如何防止放大」的产品化规则；对照章真的核对了侧写产物并列出冲突修正；无悬空的数据文件名引用、无张冠李戴、无复制残留。
- density 密度：人格特征条数、量化表、证据深度与参考相当（参考为 6-8 章、数十条具体观察）；几段空泛概述或纯 JSON 指标堆积都不达标。
- readability 可读性：导师本人能读懂；原始表达、分析判断、编辑建议三者分清；没有内部技术术语堆砌。`;

const CHECKLIST_RUBRIC = `候选与参考都是要发给导师本人书面回复的「第一轮审核清单」。按 L590 规范评四维：
- structure 结构：有导师友好的使用说明（含「可公开精确表达/去标识化/仅内部使用/不准确请修改/暂不确认」回答口径）、按主题分字母章节、组内连续数字编号、结尾有最终确认门禁清单。
- duty 职责：通常覆盖九块——身份展示、履历时间线、当前职责与真实案例披露、人格校对、语言风格、招聘观点与公平边界、行业与时效红线、授权与边界、最终确认门禁；问题要具体、带待确认口径或优先级；不得把事项混成一串长复选框，不得要求导师理解内部分类、文件路径或技术测试术语。
- density 密度：题量与阅读密度和参考相当（参考约 45-65 题）；每块有足够问题覆盖该块风险；留白方式让导师能逐题作答。
- readability 可读性：自然中文问句，导师看题就知道要确认什么、怎么答；没有内部黑话。`;

const PILOT_CLAUSE = `特别说明：本次候选属于同源试点副本（pilot）——候选导师与其中一位参考是同一人、同一轮访谈材料的复刻演练。
因此事实、经历、人格结论与该参考相同属于预期，不得按「串用事实」扣分。
你的职责改为抓「复制残留」：①引用了实际不存在的数据文件/音频文件名/知识卡数量等悬空引用；②对照章声称参考的侧写文件实际未重读却照抄旧结论；③标题、导师名、版本包语境有改头不彻底之处；④该声明「复用既有分析」而未声明。
这些问题计入 duty 与 structure；候选中若已诚实声明复用且数据引用自洽，不因复用本身扣分。`;

function buildSystemPrompt(docType: CompareInput['docType'], isPilot: boolean): string {
  return [
    '你是「AI 职业导师分身」生产线的正式文档质检评审，只依据给定规范与参考稿评分，标准严格、结论克制。',
    COMMON_RULES,
    docType === 'style_analysis' ? STYLE_RUBRIC : CHECKLIST_RUBRIC,
    isPilot ? PILOT_CLAUSE : '',
    '输出 JSON 结构：{"scores":{"structure":整数,"duty":整数,"density":整数,"readability":整数},"reasons":{"structure":"低于80时的具体原因，否则空字符串","duty":"","density":"","readability":""},"findings":[{"severity":"block|warn|info","chapter":"涉及章节名","detail":"问题描述与依据"}],"summary":"两句话总评"}',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildUserMessage(input: CompareInput): string {
  const refBlocks = input.refs
    .map(
      (r, i) =>
        `【参考稿 ${i + 1}｜导师：${r.refMentor}｜文件：${r.relPath}】\n${r.content}`,
    )
    .join('\n\n====================\n\n');
  return `评审对象信息：候选导师目录「${input.mentorDir}」${input.isPilot ? '（同源试点副本）' : ''}，候选文件「${input.candidate.relPath}」。\n\n下面先给 ${input.refs.length} 份已认可参考稿全文，再给候选全文。\n\n${refBlocks}\n\n====================\n\n【候选文件｜${input.candidate.relPath}】\n${input.candidate.content}`;
}

function clampScore(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 调 DeepSeek 对一份待审文件评分。key 缺失或响应不可解析时抛错（调用方置步骤失败，可重试）。
 */
export async function scoreViewDoc(input: CompareInput): Promise<DocCompareResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('未配置 DEEPSEEK_API_KEY/OPENAI_API_KEY，S8 AI 比对不可用（不降级为机械评分）');
  }
  const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(input.docType, input.isPilot) },
          { role: 'user', content: buildUserMessage(input) },
        ],
      }),
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause;
    throw new Error(
      `AI 比对网络调用失败：${e instanceof Error ? e.message : String(e)}${cause?.code ? `（${cause.code}）` : ''}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI 比对接口返回 ${res.status}：${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI 比对返回为空');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    throw new Error('AI 比对返回不是合法 JSON，无法采信');
  }
  const s = (parsed.scores ?? {}) as Record<string, unknown>;
  const scores: Record<CompareDimKey, number> = {
    structure: clampScore(s.structure),
    duty: clampScore(s.duty),
    density: clampScore(s.density),
    readability: clampScore(s.readability),
  };
  const r = (parsed.reasons ?? {}) as Record<string, unknown>;
  const reasons: Partial<Record<CompareDimKey, string>> = {};
  for (const d of COMPARE_DIMENSIONS) {
    const text = typeof r[d.key] === 'string' ? (r[d.key] as string).trim() : '';
    if (scores[d.key] < COMPARE_PASS_LINE) {
      reasons[d.key] = text || '（AI 判定低于达标线但未给出原因，需人工复核）';
    } else if (text) {
      reasons[d.key] = text;
    }
  }
  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: CompareFinding[] = rawFindings
    .map((f) => {
      const x = (f ?? {}) as Record<string, unknown>;
      const severity: CompareFinding['severity'] =
        x.severity === 'block' || x.severity === 'warn' || x.severity === 'info' ? x.severity : 'info';
      return {
        severity,
        chapter: typeof x.chapter === 'string' ? x.chapter.slice(0, 80) : '',
        detail: typeof x.detail === 'string' ? x.detail.slice(0, 500) : '',
      };
    })
    .filter((f) => f.detail.length > 0);

  return {
    docType: input.docType,
    relPath: input.candidate.relPath,
    scores,
    reasons,
    findings,
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
    model,
  };
}
