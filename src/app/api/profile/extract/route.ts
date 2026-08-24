/**
 * 档案提取 API — 三步走第三步核心
 * POST /api/profile/extract
 *
 * 读取用户与 AI 职导的完整对话记录，
 * 用 LLM 从对话中提取结构化个人档案信息，
 * 写入 UserProfile 表。
 *
 * 触发时机：
 * 1. AI 职导问卷完成后自动触发（前端检测到 [QUESTIONNAIRE_COMPLETED]）
 * 2. 用户在个人档案页手动点击"从对话提取"按钮
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { proxyFetch } from '@/lib/proxy-fetch';
import { fetchWithRetry } from '@/lib/ai-retry';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

// AI 提取结果校验 — 限制字段类型和长度
// 使用 .nullish() 而非 .optional()，因为 AI 会对未提及的字段返回 null
const extractedProfileSchema = z.object({
  nickname: z.string().max(50).nullish(),
  age: z.number().int().min(1).max(150).nullish(),
  gender: z.string().max(10).nullish(),
  status: z.string().max(50).nullish(),
  city: z.string().max(100).nullish(),
  industry: z.string().max(100).nullish(),
  jobContent: z.string().max(500).nullish(),
  companyType: z.string().max(50).nullish(),
  jobSatisfaction: z.number().int().min(1).max(5).nullish(),
  gradYears: z.union([z.string().max(20), z.number().int().min(1900).max(2030)]).nullish(),
  skills: z.array(z.string().max(100)).max(20).nullish(),
  goals: z.string().max(500).nullish(),
  interests: z.array(z.string().max(100)).max(20).nullish(),
  education: z.string().max(100).nullish(),
  school: z.string().max(100).nullish(),
  major: z.string().max(100).nullish(),
  enrollmentYear: z.string().max(20).nullish(),
  infoChannels: z.array(z.string().max(100)).max(20).nullish(),
  careerSpending: z.string().max(200).nullish(),
  careerAnxiety: z.string().max(500).nullish(),
  jobChangeStatus: z.string().max(200).nullish(),
  helpPriority: z.array(z.string().max(100)).max(20).nullish(),
  mentorPreference: z.array(z.string().max(100)).max(20).nullish(),
  mentorHelpAreas: z.array(z.string().max(100)).max(20).nullish(),
  productInterest: z.string().max(500).nullish(),
  productTrigger: z.array(z.string().max(100)).max(20).nullish(),
  productConcern: z.array(z.string().max(100)).max(20).nullish(),
  willingToPay: z.string().max(100).nullish(),
  recommendedMentors: z.array(z.string().max(100)).max(20).nullish(),
}).passthrough();

// API URL 白名单 — 与 chat route 保持一致
const ALLOWED_API_URLS = [
  'https://api.deepseek.com',
  'https://api.openai.com',
  'https://api.moonshot.cn',
];

const EXTRACT_PROMPT = `你是一个信息提取助手。以下是一段用户与AI榨职机的访谈对话记录。
请从对话中提取用户的个人档案信息，严格按照以下JSON格式输出。
如果某个字段在对话中未提及，设为null。
不要输出任何其他内容，只输出JSON。

JSON格式：
{
  "nickname": "用户称呼（字符串或null）。问卷Q1问'你叫什么名字'，用户回答的内容就是nickname",
  "age": "年龄（整数或null。问卷Q2问'今年多大了'。如果对话中未提及年龄，必须返回null，不要返回0）",
  "status": "在校|在职|待业（字符串或null）。问卷Q4问'目前你的状态是'，用户选择的选项",
  "city": "所在城市（字符串或null）。问卷Q3问'你在哪个城市'",
  "school": "毕业学校名称（字符串或null）。在校问卷S2问'什么学校'，在职问卷E3和待业问卷U2问'你毕业于哪个学校'",
  "major": "专业（字符串或null）。在校问卷S2、在职问卷E3、待业问卷U2都问'学什么专业'",
  "enrollmentYear": "入学年份（字符串或null）。在校问卷S1问'你是哪一年入学的'，如2022",
  "industry": "行业（字符串或null）。在职问卷E1问'你在什么行业'，待业问卷U1问'之前做什么工作'（曾从事的行业）",
  "jobContent": "工作内容/职业（字符串或null）。在职问卷E1问'做什么工作内容'，待业问卷U1问'之前做什么工作'（曾做的工作内容）",
  "companyType": "国企|民企|外企|创业公司|互联网|其他（字符串或null）。在职问卷E2问'你所在的公司是什么类型'，待业问卷U4问'之前的公司是什么类型'",
  "jobSatisfaction": "工作满意度1-5（整数或null）。在职问卷E6问'对现在的工作满意吗'，根据用户回答推断：很满意=5，满意=4，一般=3，不太满意=2，很不满意=1",
  "gradYears": "毕业年份（字符串或null）。在职问卷E4和待业问卷U3问'哪年毕业的'，如2019",
  "interests": ["兴趣方向数组"],
  "goals": "目标/看法（字符串或null）。在校问卷S3问'喜欢这个专业吗'+追问，记录喜欢/不喜欢的理由和观点；待业问卷U7问'接下来想找什么方向的工作'，记录求职方向",
  "infoChannels": ["信息渠道数组。问卷C2问'平时从哪里获取职业信息'，选项：小红书/抖音/B站/知乎/微信公众号/学校就业中心/朋友或同学推荐/招聘平台/其他"],
  "careerSpending": "过去一年在职业发展上的花费（字符串或null）。问卷C3问：过去一年在简历修改、面试辅导、职业咨询、付费课程、付费社群、考证培训等花了多少钱。提取用户回答的金额或描述。",
  "careerAnxiety": "职业困扰（字符串或null）。问卷C1问'目前你在找工作方面遇到的最大困扰是什么'",
  "jobChangeStatus": "最近六个月求职情况（字符串或null）。问卷U6问'最近六个月有没有认真找过工作'，选项：一直在找/断断续续在找/最近开始找/还没开始找",
  "helpPriority": ["最需要帮助的场景（数组）。问卷C4是单选题'以下哪一种场景是你最需要帮助的场景'，把用户选择的场景放入数组"],
  "mentorPreference": ["最想深聊的人群类型（数组）。问卷C5是单选题'你最想和以下哪类人深聊'，选项：资深HR/同行业前辈/跨行业年轻职场人/职业规划师，把用户选择的放入数组"],
  "mentorHelpAreas": ["希望导师帮助的方面数组。问卷C6多选题'你希望导师在哪些方面给你最多帮助'，选项：帮我看清自己适合什么/告诉我行业岗位的真实情况/教我具体的求职技巧/受挫时给鼓励复盘或帮我做具体决策/其他"],
  "productInterest": "对产品的第一反应（字符串或null）。问卷C7问'你对AI Career Companion的第一反应是什么'，选项：很感兴趣一定会试用/有点兴趣可能会试用/不太感兴趣可能不会试用/完全没兴趣",
  "productTrigger": ["什么情况下打开产品的数组。问卷C8多选题'什么情况下最会打开这个产品'，选项：遇到新的职业问题时/收到推送提醒时/朋友推荐时/其他"],
  "productConcern": ["最担心什么的数组。问卷C9多选题'你最担心什么'，选项：AI建议不靠谱太模板化/隐私泄露对话内容被看到/不如跟真人聊/导师是假的不是真人经验/用了没什么实际帮助/其他"],
  "willingToPay": "愿意每月付多少（字符串或null）。问卷C10问'如果试用期结束后需要付费你愿意每月付多少'，选项：不愿意付费/10元以内每月/10到30元每月/30到50元每月/50到100元每月/100元以上每月",
  "recommendedMentors": ["推荐的导师名字数组"]
}

注意：
- nickname 是用户在对话中自我介绍的称呼。对话开头AI会问"你叫什么名字"，用户回答的内容就是 nickname。务必提取，即使用户用了昵称、英文名或非正式称呼也要提取。
- jobContent（工作内容）和 industry（行业）是两个独立字段。当问卷问"你在什么行业？做什么工作内容？"时，行业部分提取到 industry，工作内容部分提取到 jobContent。例如用户回答"我在互联网行业做产品经理"，则 industry="互联网"，jobContent="产品经理"。
- 如果用户回答用逗号、顿号、斜杠/、&、空格或多个空格简短分隔（如"插画，布展"、"设计/运营"、"销售 & 市场"、"教育  培训"），前半部分是行业，后半部分是工作内容。
- 如果没有明显分隔符但语义可分（如"冶金我负责锻造"、"餐饮主要做后厨管理"），前面行业领域词是 industry，后面动作/职责描述是 jobContent。行业领域词的特征：是一个领域/行业名称（如冶金、餐饮、互联网、教育、金融、医疗、设计、销售、市场、运营、HR、人力资源、技术、研发等）。工作内容的特征：描述具体做什么事，常含"做"、"负责"、"管"、"搞"等动词。
- 实在无法区分时，整个回答放入 industry，jobContent 留空。
- interests, infoChannels, helpPriority, mentorPreference, mentorHelpAreas, productTrigger, productConcern, recommendedMentors 是数组
- 如果用户说了多个兴趣，全部放入数组
- 排序题按用户给出的排序顺序填入数组
- 如果对话中没有足够信息，对应字段设为null或空数组`;

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    // 速率限制: 每用户每小时最多3次（AI API 成本保护）
    const rateCheck = rateLimit(`profile-extract:${session.user.id}`, 3, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: '提取操作过于频繁，请1小时后再试' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    // 1. 获取用户与 AI 职导的所有对话记录
    const chatSessions = await prisma.chatSession.findMany({
      where: {
        userId: session.user.id,
        mentorId: 'ai-guide',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1, // 取最近一次对话
    });

    if (!chatSessions.length || !chatSessions[0].messages.length) {
      return NextResponse.json(
        { error: '暂无AI职导对话记录，无法提取档案' },
        { status: 400 }
      );
    }

    // 2. 拼接对话文本
    const conversation = chatSessions[0].messages
      .map((m) => `${m.role === 'user' ? '用户' : 'AI榨职机'}: ${m.content}`)
      .join('\n\n');

    // 3. 调用 LLM 提取结构化信息
    // 兼容两种环境变量名: DEEPSEEK_API_KEY 或 OPENAI_API_KEY
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1';
    const model = process.env.AI_MODEL || 'deepseek-chat';

    if (!apiKey) {
      console.error('Profile extract: Neither DEEPSEEK_API_KEY nor OPENAI_API_KEY is configured');
      return NextResponse.json(
        { error: 'AI 服务未配置' },
        { status: 500 }
      );
    }

    // API URL 白名单校验
    const baseUrl = apiUrl.replace(/\/v\d+\/?$/, '');
    if (!ALLOWED_API_URLS.includes(baseUrl)) {
      console.error('Profile extract: API URL not in allowlist:', baseUrl);
      return NextResponse.json(
        { error: '服务配置错误' },
        { status: 500 }
      );
    }

    const aiResponse = await fetchWithRetry(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          { role: 'user', content: `以下是对话记录：\n\n${conversation}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI extract error:', aiResponse.status);
      return NextResponse.json(
        { error: 'AI 提取失败，请稍后再试' },
        { status: 500 }
      );
    }

    const aiData = await aiResponse.json();
    let extractedText = aiData.choices?.[0]?.message?.content || '';

    // 清理可能的 markdown 代码块包裹
    extractedText = extractedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let extracted;
    try {
      const parsed = JSON.parse(extractedText);
      const validated = extractedProfileSchema.safeParse(parsed);
      if (!validated.success) {
        console.error('AI extract validation failed:', validated.error.issues);
        return NextResponse.json(
          { error: '档案数据格式异常，请稍后再试' },
          { status: 500 }
        );
      }
      extracted = validated.data;
      console.log('Profile extract: nickname=', extracted.nickname, 'status=', extracted.status, 'age=', extracted.age,
        'careerSpending=', extracted.careerSpending, 'goals=', extracted.goals, 'careerAnxiety=', extracted.careerAnxiety,
        'willingToPay=', extracted.willingToPay, 'infoChannels=', extracted.infoChannels);
    } catch {
      console.error('Failed to parse extracted JSON');
      return NextResponse.json(
        { error: '档案解析失败，请稍后再试' },
        { status: 500 }
      );
    }

    // 4. 写入 UserProfile（upsert）
    const arrayToJson = (arr: unknown) =>
      Array.isArray(arr) && arr.length > 0 ? JSON.stringify(arr) : null;

    // 记录变更历史（upsert 之前查询现有档案快照）
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    });

    // 事务: 历史快照 + 档案 upsert 原子化
    const profile = await prisma.$transaction(async (tx) => {
      await tx.profileHistory.create({
        data: {
          userId: session.user.id,
          action: 'extract',
          snapshot: JSON.stringify(existingProfile),
        },
      });

      return tx.userProfile.upsert({
        where: { userId: session.user.id },
        update: {
          nickname: extracted.nickname || undefined,
          age: typeof extracted.age === 'number' && extracted.age > 0 ? extracted.age : undefined,
          status: extracted.status || undefined,
          city: extracted.city || undefined,
          school: extracted.school || undefined,
          major: extracted.major || undefined,
          enrollmentYear: extracted.enrollmentYear || undefined,
          industry: extracted.industry || undefined,
          jobContent: extracted.jobContent || undefined,
          companyType: extracted.companyType || undefined,
          jobSatisfaction: typeof extracted.jobSatisfaction === 'number' ? extracted.jobSatisfaction : undefined,
          gradYears: extracted.gradYears != null ? String(extracted.gradYears) : undefined,
          interests: arrayToJson(extracted.interests) || undefined,
          goals: extracted.goals || undefined,
          infoChannels: arrayToJson(extracted.infoChannels) || undefined,
          careerSpending: extracted.careerSpending || undefined,
          careerAnxiety: extracted.careerAnxiety || undefined,
          jobChangeStatus: extracted.jobChangeStatus || undefined,
          helpPriority: arrayToJson(extracted.helpPriority) || undefined,
          mentorPreference: arrayToJson(extracted.mentorPreference) || undefined,
          mentorHelpAreas: arrayToJson(extracted.mentorHelpAreas) || undefined,
          productInterest: extracted.productInterest || undefined,
          productTrigger: arrayToJson(extracted.productTrigger) || undefined,
          productConcern: arrayToJson(extracted.productConcern) || undefined,
          willingToPay: extracted.willingToPay || undefined,
          recommendedMentors: arrayToJson(extracted.recommendedMentors) || undefined,
          profileSource: 'ai_extracted',
          lastAiExtractAt: new Date(),
        },
        create: {
          userId: session.user.id,
          nickname: extracted.nickname || undefined,
          age: typeof extracted.age === 'number' && extracted.age > 0 ? extracted.age : undefined,
          status: extracted.status || undefined,
          city: extracted.city || undefined,
          school: extracted.school || undefined,
          major: extracted.major || undefined,
          enrollmentYear: extracted.enrollmentYear || undefined,
          industry: extracted.industry || undefined,
          jobContent: extracted.jobContent || undefined,
          companyType: extracted.companyType || undefined,
          jobSatisfaction: typeof extracted.jobSatisfaction === 'number' ? extracted.jobSatisfaction : undefined,
          gradYears: extracted.gradYears != null ? String(extracted.gradYears) : undefined,
          interests: arrayToJson(extracted.interests) || undefined,
          goals: extracted.goals || undefined,
          infoChannels: arrayToJson(extracted.infoChannels) || undefined,
          careerSpending: extracted.careerSpending || undefined,
          careerAnxiety: extracted.careerAnxiety || undefined,
          jobChangeStatus: extracted.jobChangeStatus || undefined,
          helpPriority: arrayToJson(extracted.helpPriority) || undefined,
          mentorPreference: arrayToJson(extracted.mentorPreference) || undefined,
          mentorHelpAreas: arrayToJson(extracted.mentorHelpAreas) || undefined,
          productInterest: extracted.productInterest || undefined,
          productTrigger: arrayToJson(extracted.productTrigger) || undefined,
          productConcern: arrayToJson(extracted.productConcern) || undefined,
          willingToPay: extracted.willingToPay || undefined,
          recommendedMentors: arrayToJson(extracted.recommendedMentors) || undefined,
          profileSource: 'ai_extracted',
          lastAiExtractAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      profile,
      extractedFields: Object.keys(extracted).filter((k) => extracted[k] !== null && !(Array.isArray(extracted[k]) && extracted[k].length === 0)),
    });
  } catch (error) {
    console.error('Profile extract error:', error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error');
    return NextResponse.json(
      { error: '服务器错误，请稍后再试' },
      { status: 500 }
    );
  }
}
