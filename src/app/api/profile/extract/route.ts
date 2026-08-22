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
  "nickname": "用户称呼（字符串或null）",
  "age": "年龄（整数或null。如果对话中未提及年龄，必须返回null，不要返回0）",
  "status": "在校|在职|待业（字符串或null）",
  "city": "所在城市（字符串或null）",
  "school": "学校名称（字符串或null）",
  "major": "专业（字符串或null）",
  "enrollmentYear": "入学年份（字符串或null，如 2022）",
  "industry": "行业（字符串或null）",
  "jobContent": "工作内容/职业（字符串或null）",
  "companyType": "国企|民企|外企|创业公司|互联网|其他（字符串或null）",
  "jobSatisfaction": "工作满意度1-5（整数或null）",
  "gradYears": "毕业几年（整数或null）",
  "interests": ["兴趣方向数组"],
  "goals": "职业目标（字符串或null）",
  "infoChannels": ["信息渠道数组"],
  "careerSpending": "职业发展支出（字符串或null）",
  "careerAnxiety": "职业焦虑（字符串或null）",
  "jobChangeStatus": "换工作/求职情况（字符串或null）",
  "helpPriority": ["最需要帮助的排序列表"],
  "mentorPreference": ["最想深聊的人群排序列表"],
  "mentorHelpAreas": ["希望导师帮助的方面数组"],
  "productInterest": "对产品的第一反应（字符串或null）",
  "productTrigger": ["什么情况下打开产品的数组"],
  "productConcern": ["最担心什么的数组"],
  "willingToPay": "愿意每月付多少（字符串或null）",
  "recommendedMentors": ["推荐的导师名字数组"]
}

注意：
- nickname 是用户在对话中自我介绍的称呼。对话开头AI会问"你叫什么名字"，用户回答的内容就是 nickname。务必提取，即使用户用了昵称、英文名或非正式称呼也要提取。即使用户回答很短（如"阿毛"），也要提取。
- 【重要】nickname 必须原样提取，不要自作主张缩写、修改或"优化"。即使用户的名字是三个字以上（如"为王""欧阳小明"），也原样保留。只有当用户回答超过12个字、明显是一句话而不是名字时，才需要从中提炼。
- industry 和 jobContent 要拆分：industry 是用户所在的行业（如"互联网""医疗""金融"），jobContent 是用户的具体工作内容或岗位（如"产品经理""前端开发""销售"）。如果用户回答"在互联网做产品经理"，则 industry="互联网"，jobContent="产品经理"。
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

    const aiResponse = await proxyFetch(`${apiUrl}/chat/completions`, {
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
      extracted = JSON.parse(extractedText);
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
    await prisma.profileHistory.create({
      data: {
        userId: session.user.id,
        action: 'extract',
        snapshot: JSON.stringify(existingProfile),
      },
    });

    const profile = await prisma.userProfile.upsert({
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
        gradYears: typeof extracted.gradYears === 'number' ? extracted.gradYears : undefined,
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
        gradYears: typeof extracted.gradYears === 'number' ? extracted.gradYears : undefined,
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

    return NextResponse.json({
      success: true,
      profile,
      extractedStatus: extracted.status || null,
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
