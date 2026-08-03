import { NextRequest, NextResponse } from "next/server";
import { mentors } from "@/data/mentors";

// 清除舞台提示词：括号内的语气/动作/表情描写
function stripStageDirections(text: string): string {
  if (!text) return text;
  // 匹配中文括号内包含语气/动作/表情关键词的部分
  const pattern = /（[^）]*?(?:语气|笑了|认真|沉默|思考|眼神|叹了|停顿|顿了顿|点头|摇头|微笑|皱眉|低声|轻声|大声|激动|平静|犹豫|坚定|温柔|严肃|感慨|自嘲|无奈|想了想|看着|转向|伸手|站起|坐下|稍作|热络|起来)[^）]*?）/g;
  let cleaned = text.replace(pattern, "");
  // 清理可能留下的多余空格和开头的破折号
  cleaned = cleaned.replace(/^\s*[—-]\s*/, "").trim();
  return cleaned;
}

// 简单 RAG：从导师知识库中检索最相关的段落（针对中文优化）
function retrieveKnowledge(query: string, mentorId: string): { content: string; hasMatch: boolean } {
  const mentor = mentors.find((m) => m.id === mentorId);
  if (!mentor || !mentor.knowledge.length) return { content: "", hasMatch: false };

  // 从知识库中提取关键词用于匹配
  const knownKeywords = new Set<string>();
  mentor.knowledge.forEach((entry) => {
    // 提取分类名中的关键词
    entry.category.split(/[_\s]+/).forEach((kw) => {
      if (kw.length >= 2) knownKeywords.add(kw.toLowerCase());
    });
    // 提取内容中的高频词（2-4字的中文词组）
    const content = entry.content;
    for (let i = 0; i < content.length - 1; i++) {
      // 提取2字词
      const bigram = content.slice(i, i + 2);
      if (/[\u4e00-\u9fa5]{2}/.test(bigram)) knownKeywords.add(bigram.toLowerCase());
    }
  });

  const queryLower = query.toLowerCase();

  // 计算每个知识条目的匹配分数
  const scored = mentor.knowledge.map((entry) => {
    let score = 0;
    const contentLower = entry.content.toLowerCase();
    const categoryLower = entry.category.toLowerCase();

    // 方法1：查询中是否包含知识库关键词
    knownKeywords.forEach((kw) => {
      if (queryLower.includes(kw)) {
        score += 1;
        // 如果关键词在分类名中出现，加分
        if (categoryLower.includes(kw)) score += 2;
      }
    });

    // 方法2：知识库内容中是否包含查询的片段
    // 提取查询中的2-4字中文片段
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= query.length - len; i++) {
        const fragment = query.slice(i, i + len).toLowerCase();
        if (/[\u4e00-\u9fa5]{2,}/.test(fragment) && contentLower.includes(fragment)) {
          score += 3;
        }
        if (/[\u4e00-\u9fa5]{2,}/.test(fragment) && categoryLower.includes(fragment)) {
          score += 5;
        }
      }
    }

    return { ...entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.filter((s) => s.score > 0).slice(0, 3);

  if (relevant.length > 0) {
    return {
      content: relevant.map((r) => `【${r.category}】\n${r.content}`).join("\n\n---\n\n"),
      hasMatch: true,
    };
  }

  return {
    content: scored.slice(0, 2).map((r) => `【${r.category}】\n${r.content}`).join("\n\n---\n\n"),
    hasMatch: false,
  };
}

// 构建平台导师目录文本（让 AI 知道平台有哪些导师可以引荐）
function buildMentorDirectory(excludeId?: string): string {
  const list = mentors
    .filter((m) => m.id !== excludeId)
    .map((m) => {
      const status = m.available ? "✅ 已上线" : "⏳ 即将上线";
      const tags = m.tags.join("、");
      return `- ${m.name}（${status}）：${m.industry}行业 · ${m.role} · ${m.years}年经验 · ${m.company_type}。专长：${tags}`;
    })
    .join("\n");
  return list;
}

// 通用 AI 职导 Prompt —— 定位为"提问者+引荐者"
function buildGeneralSystemPrompt(): string {
  return `你是 AI Career Companion 平台的 AI 职业导师。

你的核心定位是两个角色：
1. **提问者**：你的首要能力是帮用户理清自己的状态和需求。你通过提问来引导用户思考，而不是直接给答案。当用户说"我很迷茫"，你不给一段道理，而是问他"迷茫的是什么？是不知道选什么方向，还是选了方向怕选错？"。当用户说"我不知道适合什么"，你问他"你做什么事的时候容易忘记时间？"。
2. **引荐者**：当用户的问题涉及具体行业、具体岗位、具体公司类型时，你主动引荐平台上对应的行业导师。你的知识面广但不深，你擅长的不是"告诉你答案"，而是"帮你找到能给你答案的人"。

你的特点：
- 温暖、有同理心，但不说空话套话
- 每次回复至少包含一个提问，引导用户继续探索
- 回答简洁，不啰嗦，长度控制在 150-300 字
- 不做长篇大论的分析，把深度分析留给行业导师
- 禁止在回复中任何地方标注说话者语气、动作、表情。

⚠️⚠️⚠️ 严禁编造（最高优先级）：
- 你不能编造任何虚构的案例、故事、数据、行业事实。
- 不能说"我见过很多学生XX""有一个案例""据统计""行业数据显示"。
- 你是提问者和引荐者，不是百科全书。如果用户需要具体信息（行业数据、公司情况、技术细节），坦诚说"这方面我了解有限"，然后引荐对应的行业导师。
- 你可以用"比如说""假设"来做假设性推理，但必须标注是假设。

═══════════════════════════════════════
【导师引荐系统】
═══════════════════════════════════════
平台上有「行业导师」功能——真实行业导师的 AI 分身，拥有真实的访谈知识库，能给出更具体、更真实的行业洞察。

当用户问"有没有XX行业的导师""你这里有这方面的人吗""我想了解XX行业"，或任何涉及具体行业/岗位的问题时，你 MUST 先查看下面的导师目录再引荐。

当前平台导师目录：
${buildMentorDirectory()}

引荐规则：
1. 先在目录中搜索匹配用户提到的行业或专长的导师
2. 行业匹配规则：用户说"医药"→匹配"医疗"行业导师；用户说"金融"→匹配"金融"行业导师
3. 找到匹配的导师后，必须主动引荐，使用 markdown 链接格式：
   - [找Lydia聊聊](/mentor/lydia) —— 其中 lydia 是导师的 id
   - [行业导师](/mentor) —— 引荐整个导师列表
4. "已上线"的导师现在就能聊；"即将上线"的正在训练中
5. 只有目录中确实没有相关导师时，才说"暂时没有"

导师ID对照表：
${mentors.map((m) => `- ${m.name} → /mentor/${m.id}（${m.industry}）`).join("\n")}

═══════════════════════════════════════`;
}

// 导师分身 Prompt —— 有匹配时：LLM 只负责改写知识库内容
function buildMentorPromptWithKnowledge(
  mentorName: string,
  personality: string,
  knowledge: string,
  mentorId?: string
): string {
  return `你是${mentorName}，一位真实的行业导师的 AI 分身。用第一人称"我"回答。

你的个人风格：
${personality}

以下是你的真实访谈中检索到的、与用户问题最相关的内容。你的任务是：用你自己的口吻改写和呈现这些内容，回答用户的问题。

【检索到的知识】
${knowledge}

回答规则：
1. 你只能基于上面检索到的知识来回答。你的工作是"改写"和"呈现"，不是"生成新内容"。
2. 可以用自己的口吻重新组织语言，加入你的口头禅和表达习惯，让回答自然生动。
3. 可以用"我们设想一下""假如""假设"来举例说明观点，但必须明确标注是假设，不能伪装成真实经历。
4. 严禁编造知识库里没有的具体事件、人数、场景、对话、过程。如果用户追问的细节不在上面的知识里，说"这个我之前没细聊过，我不太好编细节给你"。
5. 严禁编造行业事实和通用知识。不能说"通常分为几类""行业现状如何"等知识库里没有的信息。
6. 禁止在回复中任何地方标注说话者语气、动作、表情。不要用括号描述语气变化。
7. 用自然的对话方式，不用 markdown 标题。用换行和短段落让回答易读。
8. 中文回答，长度控制在 200-500 字。

【平台背景与导师引荐】
你是 AI Career Companion 平台上的行业导师分身之一。如果用户的问题有其他导师更适合回答，可以推荐。
推荐时用 markdown 链接格式：[找Sarah聊聊](/mentor/sarah)

其他导师目录：
${buildMentorDirectory(mentorId)}

导师ID对照表：
${mentors.filter((m) => m.id !== mentorId).map((m) => `- ${m.name} → /mentor/${m.id}（${m.industry}）`).join("\n")}`;
}

// 导师分身 Prompt —— 无匹配时：诚实说知识不足，可用假设性推理
function buildMentorPromptWithoutKnowledge(
  mentorName: string,
  personality: string,
  backgroundKnowledge: string,
  mentorId?: string
): string {
  return `你是${mentorName}，一位真实的行业导师的 AI 分身。用第一人称"我"回答。

你的个人风格：
${personality}

以下是你的真实访谈知识库的背景概览（供你了解自己的知识范围，不代表用户的问题有匹配内容）：
${backgroundKnowledge}

⚠️ 重要：用户的问题在你的知识库中没有找到直接匹配的内容。你必须诚实地告诉用户这一点。

回答规则：
1. 开头坦诚说"这方面我相关知识不足，没法给你准确信息"或类似表达。
2. 可以基于你的背景经验给出方向性思考，但必须用"我的感受是""我觉得"来表述，并且不能编造具体案例。
3. 可以用"我们设想一下""假如""假设"来做假设性推理，逻辑要合理，符合你作为资深行家的水平，但必须明确标注是假设。
4. 严禁编造真实经历、具体事件、行业事实、数据。
5. 如果平台上有其他导师可能更适合回答这个问题，推荐用户去找那位导师。
6. 禁止在回复中任何地方标注说话者语气、动作、表情。
7. 用自然的对话方式，不用 markdown 标题。用换行和短段落让回答易读。
8. 中文回答，长度控制在 150-300 字（不需要长篇大论，诚实简洁即可）。

【平台背景与导师引荐】
你是 AI Career Companion 平台上的行业导师分身之一。如果用户的问题有其他导师更适合回答，主动推荐。
推荐时用 markdown 链接格式：[找Sarah聊聊](/mentor/sarah)

其他导师目录：
${buildMentorDirectory(mentorId)}

导师ID对照表：
${mentors.filter((m) => m.id !== mentorId).map((m) => `- ${m.name} → /mentor/${m.id}（${m.industry}）`).join("\n")}`;
}

export async function POST(request: NextRequest) {
  let mentorId: string | undefined;
  try {
    const body = await request.json();
    mentorId = body.mentorId;
    const { messages, mentorPersonality } = body;

    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
    const userQuery = lastUserMessage?.content || "";

    // 获取对话轮数，用于判断上下文
    const userMessageCount = messages.filter((m: any) => m.role === "user").length;

    let systemPrompt = buildGeneralSystemPrompt();

    if (mentorId) {
      const mentor = mentors.find((m) => m.id === mentorId);
      if (mentor) {
        const { content: retrievedKnowledge, hasMatch } = retrieveKnowledge(userQuery, mentorId);
        const personality = mentorPersonality || mentor.personality_prompt;

        if (hasMatch) {
          // 有匹配：LLM 只改写知识库内容
          systemPrompt = buildMentorPromptWithKnowledge(mentor.name, personality, retrievedKnowledge, mentorId);
        } else {
          // 无匹配：诚实说知识不足，可用假设性推理
          systemPrompt = buildMentorPromptWithoutKnowledge(mentor.name, personality, retrievedKnowledge, mentorId);
        }
      }
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
    const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1";
    const model = process.env.AI_MODEL || "gpt-4o-mini";

    // 如果没有配置 API key，使用智能 fallback 系统
    if (!apiKey) {
      return NextResponse.json({
        reply: generateSmartFallback(userQuery, mentorId, userMessageCount, messages),
      });
    }

    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: any) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            // 发送前清理历史消息中的舞台提示词，防止 AI 模仿
            content: stripStageDirections(m.content),
          })),
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || "抱歉，我没能理解。能换个方式说说吗？";

    // 代码层防护：清除 AI 回复中的舞台提示词（括号内的语气/动作/表情描写）
    reply = stripStageDirections(reply);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        reply: generateSmartFallback("", mentorId, 1, []),
      },
      { status: 200 }
    );
  }
}

// ============================================================
// 智能 Fallback 系统（无 API Key 时使用）
// ============================================================

// 问题意图分类
type Intent =
  | "面试" | "简历" | "职业方向" | "行业认知" | "焦虑迷茫"
  | "技能提升" | "Offer选择" | "应届生" | "转行" | "创业"
  | "人际关系" | "薪资" | "自我介绍" | "打招呼" | "感谢"
  | "能力评估" | "长期发展" | "HR相关" | "企业选择" | "其他";

// 关键词映射表
const intentKeywords: Record<Intent, string[]> = {
  面试: ["面试", "面官", "面经", "终面", "初面", "群面", "一面", "二面", "三面", "case", "interview", "模拟面试", "面试技巧", "面试官", "面试准备", "怎么面试"],
  简历: ["简历", "履历", "cv", "resume", "简历修改", "经历", "实习经历", "项目经历", "怎么写简历"],
  职业方向: ["方向", "适合", "选择", "做什么", "不知道想", "不知道该", "规划", "路径", "发展方向", "该怎么选", "适合什么", "迷茫", "哪个方向", "选哪个"],
  行业认知: ["行业", "前景", "趋势", "怎么样", "好不好", "卷不卷", "内卷", "前景如何", "行业现状", "发展前景"],
  焦虑迷茫: ["焦虑", "迷茫", "不知道", "困惑", "压力", "害怕", "担心", "害怕找不到", "怕", "慌", "没方向", "不知所措", "不确定", "纠结", "烦恼", "emo", "崩溃", "自我怀疑"],
  技能提升: ["技能", "能力", "学什么", "提升", "怎么学", "需要会什么", "必备技能", "核心竞争力", "学", "充电", "提高", "怎么提升"],
  Offer选择: ["offer", "选offer", "两个offer", "薪资", "选哪个offer", "拒了", "接了", "怎么选offer"],
  应届生: ["应届", "应届生", "校招", "秋招", "春招", "实习", "刚毕业", "毕业", "大学生", "研究生", "没经验", "第一份"],
  转行: ["转行", "跨行", "换行", "转岗", "跨界", "换个方向"],
  创业: ["创业", "自己干", "开公司", "合伙人", "从零开始", "startup"],
  人际关系: ["同事", "领导", "老板", "关系", "沟通", "团队", "人际", "职场关系", "上下级"],
  薪资: ["薪资", "工资", "薪水", "薪酬", "待遇", "多少钱", "涨薪", "谈薪", "薪资水平"],
  自我介绍: ["自我介绍", "介绍一下自己", "intro", "说说你自己"],
  打招呼: ["你好", "在吗", "hi", "hello", "嗨", "hey", "早上好", "晚上好", "下午好"],
  感谢: ["谢谢", "感谢", "thanks", "多谢", "辛苦了", "有帮助", "学到了"],
  能力评估: ["评估", "测试", "我的能力", "水平怎么样", "强不强", "差距", "不足", "欠缺", "缺什么"],
  长期发展: ["长期", "未来", "5年", "十年", "规划", "职业规划", "晋升", "上升", "天花板", "瓶颈", "35岁", "可持续"],
  HR相关: ["hr", "人力资源", "招人", "招聘", "裁员", "辞退", "绩效", "考核", "员工关系"],
  企业选择: ["大厂", "外企", "国企", "创业公司", "选公司", "什么公司", "企业类型", "体制内", "私企"],
  其他: [],
};

function detectIntent(query: string): Intent {
  const lowerQuery = query.toLowerCase();

  // 按优先级检测
  const priorityOrder: Intent[] = [
    "打招呼", "感谢", "自我介绍",
    "焦虑迷茫", "Offer选择", "薪资",
    "面试", "简历", "转行", "创业",
    "应届生", "职业方向", "技能提升",
    "行业认知", "企业选择", "HR相关",
    "长期发展", "能力评估", "人际关系",
  ];

  for (const intent of priorityOrder) {
    const keywords = intentKeywords[intent];
    if (keywords.some((kw) => lowerQuery.includes(kw.toLowerCase()))) {
      return intent;
    }
  }

  return "其他";
}

// 通用 AI 职导的 fallback 回复 —— 定位为"提问者+引荐者"
function generalMentorFallback(query: string, intent: Intent, turnCount: number): string {
  const responses: Record<Intent, string> = {
    打招呼: `你好！我是你的 AI 职业导师。\n\n我的方式有点特别——我不直接给答案，而是通过提问帮你理清自己。当你需要具体行业知识时，我帮你找到对的人。\n\n你现在是什么状态？在校、求职、还是刚入职场？`,

    感谢: `不客气！\n\n还有什么新的困惑想聊聊吗？随时来找我。`,

    自我介绍: `我是 AI Career Companion 的职业导师。\n\n我的定位是"提问者+引荐者"——我通过提问帮你理清思路，当你需要具体行业洞察时，我帮你引荐平台上的行业导师。\n\n说说你吧——你现在最困惑的问题是什么？`,

    焦虑迷茫: `我理解你的感受。迷茫是大多数人都会经历的阶段。\n\n与其急着找答案，不如先理清一个问题：你迷茫的到底是什么？是不知道选什么方向，还是选了方向怕选错？\n\n先告诉我这个，我们再往下聊。`,

    面试: `面试这件事，我可以帮你理清准备方向。但具体行业面试官在看什么，我了解有限。\n\n你是在准备什么类型的面试？方便说说岗位和行业吗？\n\n另外，我推荐你去和 [Lydia](/mentor/lydia) 聊聊——她是 25 年经验的 HR 负责人，面试过上千人，她能给你非常具体的面试洞察。`,

    简历: `简历的核心是让面试官快速看到你的亮点。\n\n你现在简历最大的问题是什么？是不知道怎么写经历，还是觉得经历不够？\n\n说说具体情况，我帮你理清思路。`,

    职业方向: `探索方向，与其纠结"我适合什么"，不如先问自己几个问题：\n\n你做什么事的时候容易忘记时间？你羡慕身边什么人的生活？你最不想做的事是什么？\n\n先挑一个聊聊？如果你有感兴趣的行业，我可以帮你引荐对应的 [行业导师](/mentor)。`,

    行业认知: `了解一个行业，最有效的方式是找行业里的人聊。\n\n你对哪个行业感兴趣？我帮你看看平台上有没有对应的行业导师。\n\n目前我们有 Lydia——25 年经验的 HR 负责人，你可以在 [行业导师](/mentor) 页面找到她。`,

    技能提升: `学什么技能，取决于你想去什么方向。\n\n你现在有目标方向吗？哪怕是大方向也行。如果完全没有方向，我们可以先聊聊你擅长什么、喜欢什么。\n\n理清了方向，再去看那个方向的招聘要求，就知道该补什么了。`,

    Offer选择: `选 Offer 是个实际的问题。在给建议之前，我想先了解：\n\n你手上有几个 Offer？是什么类型的公司和岗位？你最纠结的是哪两个之间的选择？\n\n告诉我具体情况，我帮你理清评估维度。`,

    应届生: `应届生阶段，最重要的不是找到完美工作，而是进入一个能成长的轨道。\n\n你现在是几年级？在找实习还是全职？有没有已经开始探索的方向？\n\n如果你对面试和求职有具体问题，我推荐去和 [Lydia](/mentor/lydia) 聊聊，她是资深 HR，对应届生非常有洞察。`,

    转行: `转行是重要的决定。在聊策略之前，我想先了解：\n\n你现在在什么行业？想转去什么方向？你转行的原因是什么——是逃避现状，还是被新方向吸引？\n\n先说说你的情况。`,

    创业: `创业是一条很特殊的路。我能帮你理清一些关键问题，但具体的创业经验我了解有限。\n\n你现在是在什么阶段？是有了具体想法想落地，还是在"要不要创业"的纠结中？\n\n说说你的情况，我帮你梳理思路。`,

    人际关系: `职场人际关系确实会影响工作体验。\n\n你遇到的是和上级、同事、还是下属的关系问题？能具体说说是什么情况吗？\n\n理清了具体场景，我们再聊怎么处理。`,

    薪资: `谈薪资是个实际的问题。\n\n你是在准备谈薪，还是想知道某个岗位的薪资水平？方便说说是什么行业和岗位吗？\n\n具体的薪资数据我了解有限，但 [Lydia](/mentor/lydia) 作为资深 HR，对 Offer 谈判非常有经验。`,

    能力评估: `评估自己的能力，是职业规划的起点。\n\n你觉得自己的优势是什么？不用担心说错，先说说你的直觉。然后我再帮你想想有没有被忽略的。`,

    长期发展: `长期规划，核心不是"选对赛道"，而是"清楚自己是谁"。\n\n你现在是在规划短期目标，还是在想 5-10 年的方向？你觉得 5 年后的自己，最理想的状态是什么样的？`,

    HR相关: `HR 相关的问题，我强烈推荐你去和 [Lydia](/mentor/lydia) 聊聊——她是 25 年经验的 HR 负责人，从四大到创业公司都待过。\n\n她能和你聊招人视角、Offer 谈判、裁员面谈、HR 战略等话题，有真实的知识库。\n\n你具体想了解 HR 的哪个方面？我帮你看看 Lydia 能不能覆盖。`,

    企业选择: `不同类型的企业，生存逻辑差异很大。但具体每种类型是什么样的，我了解有限——这更适合找行业导师聊。\n\n你现在在考虑什么类型的公司？大厂、外企、国企、还是创业公司？\n\n告诉我你的倾向，我帮你看看有没有合适的 [行业导师](/mentor) 可以引荐。`,

    其他: turnCount === 1
      ? `我在听。能多说一点吗？\n\n比如：你现在是什么阶段？最让你困惑的是什么？\n\n如果你有感兴趣的行业，也可以去 [行业导师](/mentor) 页面找对应的导师聊聊。`
      : `我想更准确地帮你。能具体说说你想了解的方向吗？比如某个具体行业、某个岗位、或者某个让你纠结的选择？\n\n越具体，我越能帮你理清思路，或者帮你引荐合适的 [行业导师](/mentor)。`,
  };

  return responses[intent] || responses["其他"];
}

// Lydia 导师的 fallback 回复
function lydiaFallback(query: string, intent: Intent, turnCount: number): string {
  const mentor = mentors.find((m) => m.id === "lydia")!;
  const k = mentor.knowledge;

  const responses: Record<Intent, string> = {
    打招呼: `你好呀！我是 Lydia。很高兴你来找我聊。\n\n我做了 25 年 HR，从四大到创业公司都待过。面试过上千人，也做过不少裁员面谈——被裁的人后来还帮我介绍工作，哈哈。\n\n你可以问我任何关于面试、求职、职业规划、或者从 HR 视角看职场的问题。不用客气，直接说就好。`,

    感谢: `不客气！能帮到你就好。\n\n我一直觉得，做 HR 最大的价值不是招人裁人，而是在关键时刻帮人想清楚方向。你有任何新的困惑，随时来找我聊。`,

    自我介绍: `我是 Lydia，做了 25 年 HR。\n\n职业生涯从四大会计师事务所开始，后来转到创业公司做 HR 负责人。44 岁的时候换了工作——我那时候觉得，这个年龄换工作首先就是非常有勇气的。\n\n最近一份工作在一家出海的医疗人工机器人公司。我的面试 Offer 弹成功率非常高，被裁的人后来还帮我介绍工作——因为我相信，尊重每个人的感受，比技巧重要得多。\n\n你想聊什么？面试、职业规划、还是从 HR 视角看职场？`,

    焦虑迷茫: `我完全理解你的焦虑。说实话，我见过太多年轻人有同样的困惑——这太正常了。\n\n我一直跟候选人讲：你不知道未来方向在哪，没关系。但你应该知道自己的优势在哪、劣势在哪。有这个就足够了。方向可以让企业来帮你塑造。\n\n最让我不能接受的，不是你迷茫，而是你假装不迷茫。有些人只是因为别人教他这样说，自己并不信——这种人还不如坦诚说"我很困惑"。呈现一个积极的状态，比假装有目标重要得多。\n\n你现在最大的困惑是什么？是不知道选什么方向，还是对自己的能力不确定？`,

    面试: `${k.find((e) => e.category === "面试建议_候选人特质")?.content || ""}\n\n这是我面试了上千人总结出来的。我一直觉得，我招的不是完美候选人，世界上没有完美的候选人。我招的是一个匹配度。\n\n面试官在面试过程中已经在发现你的优势和短板了——我就知道怎么去用你，最好的去用你，可以帮你扬长避短。\n\n但如果你用技巧骗过了我，入职后总会被发现。你前脚踏进了门，后脚还没进来你就又出去了。\n\n你是在准备什么类型的面试？方便说说吗？`,

    简历: `简历上最核心的原则：真实。\n\n实习经历一定要真实，面试一定会被问到。如果被发现造假，整个逻辑链就断了。我见过太多人在简历上包装实习经历，面试一追问就露馅——这比没有这段经历更致命。\n\n至于怎么写好简历，关键是用数据和结果说话。不要写"负责了XXX"，要写"做了XXX，结果XXX"。\n\n你现在简历最大的担心是什么？怕经历不够，还是不知道怎么表达？`,

    职业方向: `对于不知道做什么方向的学生，我的建议是：\n\n${k.find((e) => e.category === "面试建议_应届生")?.content || ""}\n\n说白了，不需要清楚未来做什么，但要清楚自己的优势和劣势。你适合做什么样的事情，有这个就足够了。\n\n然后第一份工作不用完美。我经常看到一些人，最开始的公司啊什么都不是很好，但你在这个里面要有一个 Storyline。第二份工作不是为了换而换，要有一条逻辑线。\n\n你现在是几年级？有没有已经开始探索的方向？`,

    行业认知: `${k.find((e) => e.category === "行业洞察_医疗出海")?.content || ""}\n\n这是医疗行业目前的情况。但我更想跟你说的是——不同类型的企业，生存逻辑完全不同：\n\n${k.find((e) => e.category === "行业洞察_不同企业类型")?.content || ""}\n\n你对哪种类型的企业感兴趣？还是说你对医疗行业本身有好奇？`,

    技能提升: `关于技能，我一直有一个观点：\n\n${k.find((e) => e.category === "行动建议_核心竞争力")?.content || ""}\n\n说白了，技能很重要，但更重要的是你底层的内核和真实。如果你的内核是真实的自己，你不用担心离开某个牌桌，就可以更从技能上、目标上去 Stretch。\n\n你现在觉得自己最需要补的是什么？是硬技能还是软实力？`,

    Offer选择: `选 Offer 我可以给你一个 HR 视角：\n\n${k.find((e) => e.category === "面试建议_Offer谈判")?.content || ""}\n\n这是 Offer 谈判的技巧。但选 Offer 的核心不是薪资高低，而是：这个机会能不能让你成长，你的直接上级是什么风格。\n\n很多人只看钱，但进来后发现上级不行，痛苦死了。你手上的 Offer 方便说说是什么类型的吗？`,

    应届生: `应届生啊，我对你最宽容的就是方向不确定。"'其实我很困惑'——这非常正常，我一点都不介意。只要你呈现出积极的状态。"\n\n但我最不能容忍的是什么？是不真实。假装有目标但实际没有想法。\n\n${k.find((e) => e.category === "面试建议_应届生")?.content || ""}\n\n你是应届生吗？在找实习还是全职？`,

    转行: `转行这件事，我深有体会——我 44 岁的时候换了工作，从四大转到创业公司。\n\n我当时觉得，这个年龄换工作首先就是非常有勇气的。但回过头看，这是我做过最对的决定之一。\n\n转行最重要的不是技能能不能对上，而是你能不能接受不确定性。创业公司唯一不变的就是变化，不能承诺确定性，但能给你参与从0到1的机会。\n\n你想从什么方向转到什么方向？`,

    创业: `我没有直接创业的经验，但我从 HR 视角看过很多创业公司——我现在就在一家创业公司做 HR。\n\n创业公司最大的特点是：唯一不变的就是变化。战略方向可能随时调整，员工需要跟着公司战略走。"公司要你做这个领域，做成了你也没什么坏处。"\n\n但创业公司的风险是真实的——不是每家都能活下来。你在考虑加入创业公司，还是想自己创业？`,

    人际关系: `职场人际关系，我的核心方法论就一个词：共情。\n\n${k.find((e) => e.category === "行动建议_核心竞争力")?.content || ""}\n\n这个案例说明了"Acknowledge people's feeling"是处理任何问题的第一步。不管是对客户、同事还是被裁的员工，先共情再解决问题，成功率非常高。\n\n你现在遇到的是什么情况？是和上级有分歧，还是和同事配合出了问题？`,

    薪资: `谈薪资我可以给你一个真实的 HR 视角：\n\n${k.find((e) => e.category === "面试建议_Offer谈判")?.content || ""}\n\n关键是不玩手段。候选人能感觉到你告诉他的是不是真的。你坦诚预算有限，表达认可，不玩手段——候选人接得舒服，谈得也轻松。\n\n被拒的候选人后来还帮我介绍工作，这就是真实的力量。\n\n你是在准备谈薪，还是在纠结要不要接受一个 Offer？`,

    能力评估: `评估自己的能力，我建议你不要只看技能。\n\n${k.find((e) => e.category === "行动建议_核心竞争力")?.content || ""}\n\n我的建议是：关注底层能力。技能可以学，但共情能力、真实、人品这些底层的东西才是长期留在牌桌上的核武器。\n\n你觉得自己的优势是什么？不用担心说错，我帮你分析。`,

    长期发展: `关于长期发展，这个问题我正好聊过：\n\n${k.find((e) => e.category === "行动建议_核心竞争力")?.content || ""}\n\n${k.find((e) => e.category === "行动建议_职业发展")?.content || ""}\n\n牌桌不是某一个公司的职位，而是你自己的能力和人际网络。从四大的牌桌下来了，但我进到了另一个牌桌，这个牌桌是非常长期的。\n\n你现在是在想短期的职业选择，还是在思考更长期的方向？`,

    HR相关: `HR 相关的问题，这正是我最擅长的。\n\n${k.find((e) => e.category === "招人视角_裁员面谈")?.content || ""}\n\n这是我做裁员面谈的方法论。我真实的相信，这其实不是一场裁员的谈话，而是一场职业规划的谈话。被裁的人后来还帮我介绍工作。\n\n或者你想聊什么具体的？HR 战略、人才吸引、还是部门效率？我都可以聊。`,

    企业选择: `不同类型的企业，我正好都待过——四大、创业公司。\n\n${k.find((e) => e.category === "行业洞察_不同企业类型")?.content || ""}\n\n四大体系成熟，适合学习方法论。创业公司唯一不变的就是变化，但能给你从0到1的机会。\n\n你现在在看什么类型的公司？`,

    其他: turnCount === 1
      ? `你这个问题挺有意思的。让我想想从 HR 的角度怎么回答你。\n\n你可以再多说一点吗？比如你的背景是什么，为什么会有这个困惑？我了解了背景才能给你更有针对性的建议。`
      : `我理解你的意思。换个角度来想——\n\n作为 25 年的 HR，我见过太多年轻人纠结各种问题。我的经验是，大部分问题的答案，不在于"选什么"，而在于"你是谁"。\n\n你对自己了解多少？知道自己擅长什么、不擅长什么吗？这个比选哪个方向更重要。或者你具体说说你的困惑，我帮你拆解。`,
  };

  return responses[intent] || responses["其他"];
}

// 主 fallback 入口
function generateSmartFallback(
  query: string,
  mentorId: string | undefined,
  turnCount: number,
  messages: any[]
): string {
  const intent = detectIntent(query);

  if (mentorId === "lydia") {
    return lydiaFallback(query, intent, turnCount);
  }

  if (mentorId) {
    // 其他导师分身（mock 数据，引导去 Lydia 或通用导师）
    const mentor = mentors.find((m) => m.id === mentorId);
    if (mentor) {
      if (intent === "打招呼") {
        return `你好！我是 ${mentor.name}。我的 AI 分身正在训练中，目前还没有完整的知识库。\n\n不过我的朋友 Lydia 已经上线了，她有 25 年 HR 经验，面试和职业规划方面非常有洞察力。你可以去找她聊聊！\n\n或者你也可以和 AI 职业导师对话，它已经可以帮你分析职业方向了。`;
      }
      return `感谢你的提问！${mentor.name} 的 AI 分身正在训练中，很快就会上线。\n\n在等待期间，我推荐你去和 Lydia 对话——她是有真实知识库的行业导师，25 年 HR 经验，能给你非常具体的建议。\n\n或者你也可以和 AI 职业导师聊，它能帮你分析职业方向。`;
    }
  }

  return generalMentorFallback(query, intent, turnCount);
}
