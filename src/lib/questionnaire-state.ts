/**
 * 问卷状态机 - 驱动整个问卷/聊天流转的底层骨架
 *
 * 核心设计:
 * 1. 后端通过数据库持久化的 step 字段确定当前问题(不依赖 chatHistory 推断)
 * 2. [CHOICE] 标签由状态机注入, 不依赖关键词匹配
 * 3. 分支流转由 Q4 的答案决定(在校/在职/待业), 写入 questionnaireBranch
 * 4. AI 负责自然语言包装, 状态机负责流程控制
 */

export type QuestionType = 'open' | 'choice-single' | 'choice-multi' | 'choice-rank';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  followUp?: { match: string; question: string }[];
  field?: string | string[];
  nextId?: string;
  branch?: { match: string; nextId: string }[];
  isLast?: boolean;
}

export const questions: Record<string, Question> = {
  Q1: {
    id: 'Q1',
    text: '你叫什么名字? (可以真姓实名, 也可以用昵称.)',
    type: 'open',
    field: 'nickname',
    nextId: 'Q2',
  },
  Q2: {
    id: 'Q2',
    text: '今年多大了?',
    type: 'open',
    field: 'age',
    nextId: 'Q3',
  },
  Q3: {
    id: 'Q3',
    text: '你在哪个城市?',
    type: 'open',
    field: 'city',
    nextId: 'Q4',
  },
  Q4: {
    id: 'Q4',
    text: '目前你的状态是?',
    type: 'choice-single',
    options: ['在校', '在职', '待业'],
    field: 'status',
    branch: [
      { match: '在校', nextId: 'S1' },
      { match: '在职', nextId: 'E1' },
      { match: '待业', nextId: 'U1' },
    ],
  },
  S1: {
    id: 'S1',
    text: '你现在读几年级?',
    type: 'open',
    field: 'enrollmentYear',
    nextId: 'S2',
  },
  S2: {
    id: 'S2',
    text: '什么学校? 学什么专业的?',
    type: 'open',
    field: ['school', 'major'],
    nextId: 'S3',
  },
  S3: {
    id: 'S3',
    text: '喜欢这个专业吗?',
    type: 'open',
    followUp: [
      { match: '喜欢', question: '喜欢哪里?' },
      { match: '不喜欢', question: '为什么不喜欢? 真正喜欢的专业是什么?' },
    ],
    nextId: 'C1',
  },
  E1: {
    id: 'E1',
    text: '你在什么行业? 做什么工作内容?',
    type: 'open',
    field: ['industry', 'jobContent'],
    nextId: 'E2',
  },
  E2: {
    id: 'E2',
    text: '你所在的公司是什么类型?',
    type: 'choice-single',
    options: ['国企', '民企', '外企', '创业公司', '互联网', '其他'],
    field: 'companyType',
    nextId: 'E3',
  },
  E3: {
    id: 'E3',
    text: '你毕业于哪个学校? 什么专业?',
    type: 'open',
    field: ['school', 'major'],
    nextId: 'E4',
  },
  E4: {
    id: 'E4',
    text: '哪年毕业的?',
    type: 'open',
    field: 'gradYears',
    nextId: 'E5',
  },
  E5: {
    id: 'E5',
    text: '工作多久了?',
    type: 'open',
    nextId: 'E6',
  },
  E6: {
    id: 'E6',
    text: '对现在的工作满意吗?',
    type: 'open',
    followUp: [
      { match: '满意', question: '最满意的是什么?' },
      { match: '不满意', question: '想换什么方向?' },
    ],
    field: 'jobSatisfaction',
    nextId: 'C1',
  },
  U1: {
    id: 'U1',
    text: '之前做什么工作?',
    type: 'open',
    field: ['industry', 'jobContent'],
    nextId: 'U2',
  },
  U2: {
    id: 'U2',
    text: '你毕业于哪个学校? 什么专业?',
    type: 'open',
    field: ['school', 'major'],
    nextId: 'U3',
  },
  U3: {
    id: 'U3',
    text: '哪年毕业的?',
    type: 'open',
    field: 'gradYears',
    nextId: 'U4',
  },
  U4: {
    id: 'U4',
    text: '离职多久了?',
    type: 'open',
    nextId: 'U5',
  },
  U5: {
    id: 'U5',
    text: '最近六个月有没有认真找过工作?',
    type: 'choice-single',
    options: ['一直在找', '断断续续在找', '最近开始找', '还没开始找'],
    field: 'jobChangeStatus',
    nextId: 'U6',
  },
  U6: {
    id: 'U6',
    text: '接下来想找什么方向的工作?',
    type: 'open',
    field: 'goals',
    nextId: 'C1',
  },
  C1: {
    id: 'C1',
    text: '目前你在找工作方面, 遇到的最大困扰是什么?',
    type: 'open',
    field: 'careerAnxiety',
    nextId: 'C2',
  },
  C2: {
    id: 'C2',
    text: '平时从哪里获取和职业有关的信息呢?',
    type: 'choice-multi',
    options: ['小红书', '抖音', 'B站', '知乎', '微信公众号', '学校就业中心', '朋友或同学推荐', '招聘平台', '其他渠道'],
    field: 'infoChannels',
    followUp: [
      { match: '__multi__', question: '这些渠道里你最依赖哪个? 为什么?' },
    ],
    nextId: 'C3',
  },
  C3: {
    id: 'C3',
    text: '过去一年, 你在职业发展上花了多少钱? 包括简历修改, 面试辅导, 职业咨询, 付费课程, 付费社群, 考证培训等.',
    type: 'open',
    field: 'careerSpending',
    nextId: 'C4',
  },
  C4: {
    id: 'C4',
    text: '以下哪一种场景是你最需要帮助的场景?',
    type: 'choice-single',
    options: [
      '不知道适合什么方向/看不到发展路径',
      '知道方向但不知道怎么准备/技能瓶颈需要提升建议',
      '正在求职需要面试指导/向上沟通人际关系困难',
      '拿到offer需要选择谈判/想转行跳槽不确定方向',
      '已入职遇到适应困难/薪资谈判晋升面谈需要策略',
    ],
    field: 'helpPriority',
    nextId: 'C5',
  },
  C5: {
    id: 'C5',
    text: '如果可以选择, 你最想和以下哪类人深聊?',
    type: 'choice-single',
    options: ['资深HR', '同行业前辈', '跨行业年轻职场人', '职业规划师'],
    field: 'mentorPreference',
    nextId: 'C6',
  },
  C6: {
    id: 'C6',
    text: '你希望导师在哪些方面给你最多帮助? (可多选)',
    type: 'choice-multi',
    options: ['帮我看清自己适合什么', '告诉我行业岗位的真实情况', '教我具体的求职技巧', '受挫时给鼓励复盘或帮我做具体决策', '其他'],
    field: 'mentorHelpAreas',
    nextId: 'C7',
  },
  C7: {
    id: 'C7',
    text: '你对AI Career Companion的第一反应是什么?',
    type: 'choice-single',
    options: ['很感兴趣一定会试用', '有点兴趣可能会试用', '不太感兴趣可能不会试用', '完全没兴趣'],
    field: 'productInterest',
    nextId: 'C8',
  },
  C8: {
    id: 'C8',
    text: '什么情况下最会打开这个产品? (可多选)',
    type: 'choice-multi',
    options: ['遇到新的职业问题时', '收到推送提醒时', '朋友推荐时', '其他'],
    field: 'productTrigger',
    nextId: 'C9',
  },
  C9: {
    id: 'C9',
    text: '你最担心什么? (可多选)',
    type: 'choice-multi',
    options: ['AI建议不靠谱太模板化', '隐私泄露对话内容被看到', '不如跟真人聊', '导师是假的不是真人经验', '用了没什么实际帮助', '其他'],
    field: 'productConcern',
    nextId: 'C10',
  },
  C10: {
    id: 'C10',
    text: '如果试用期结束后需要付费, 你愿意每月付多少?',
    type: 'choice-single',
    options: ['不愿意付费', '10元以内每月', '10到30元每月', '30到50元每月', '50到100元每月', '100元以上每月'],
    field: 'willingToPay',
    nextId: 'C11',
  },
  C11: {
    id: 'C11',
    text: '如果学校或公司提供这个工具(免费或优惠), 你会用吗?',
    type: 'choice-single',
    options: ['一定会用应该提供', '可能会用取决于好不好', '不太想用', '无所谓'],
    nextId: 'END',
  },
  END: {
    id: 'END',
    text: '问卷已完成',
    type: 'open',
    isLast: true,
  },
};

// ============================================================
// 分支同义词匹配
// ============================================================

const BRANCH_SYNONYMS: Record<string, string[]> = {
  '在校': ['在校', '学生', '读书', '上学', '在读', '学校'],
  '在职': ['在职', '工作', '上班', '打工'],
  '待业': ['待业', '失业', '找工作', '无业'],
};

const BRANCH_MAP: Record<string, string> = {
  '在校': 'STUDENT',
  '在职': 'WORKING',
  '待业': 'UNEMPLOYED',
};

function matchBranch(answer: string): { match: string; nextId: string; branch: string } | null {
  for (const b of questions.Q4.branch || []) {
    const synonyms = BRANCH_SYNONYMS[b.match] || [b.match];
    if (synonyms.some((s) => answer.includes(s))) {
      return { match: b.match, nextId: b.nextId, branch: BRANCH_MAP[b.match] || '' };
    }
  }
  return null;
}

// ============================================================
// 状态机核心函数 - 基于数据库持久化 step
// ============================================================

export function advanceFromStep(
  currentStep: string | null,
  userAnswer: string,
  currentBranch: string | null
): { question: Question; branch?: string } {
  if (!currentStep || currentStep === 'null') {
    return { question: questions.Q1 };
  }

  const currentQ = questions[currentStep];
  if (!currentQ) {
    return { question: questions.Q1 };
  }

  if (currentQ.isLast) {
    return { question: questions.END };
  }

  if (currentQ.branch) {
    const match = matchBranch(userAnswer);
    if (match) {
      return { question: questions[match.nextId], branch: match.branch };
    }
    return { question: currentQ };
  }

  if (currentQ.nextId) {
    return { question: questions[currentQ.nextId] };
  }

  return { question: questions.END };
}

export function formatChoiceTag(q: Question): string {
  if (!q.options || q.options.length === 0) return '';
  const type = q.type === 'choice-multi' ? 'multi' : q.type === 'choice-rank' ? 'rank' : 'single';
  const optionsText = q.options.join('\n');
  return `\n[CHOICE:type=${type}]\n${optionsText}\n[/CHOICE]`;
}

export function injectChoiceByState(reply: string, currentQuestion: Question): string {
  if (reply.includes('[QUESTIONNAIRE_COMPLETED]')) return reply;
  let cleaned = reply.replace(/\[CHOICE[^\]]*\][\s\S]*?\[\/CHOICE\]/gi, '').trim();
  if (!currentQuestion.options || currentQuestion.options.length === 0) return cleaned;
  return cleaned.trimEnd() + formatChoiceTag(currentQuestion);
}

export function buildStateHint(currentQuestion: Question): string {
  if (currentQuestion.isLast) {
    return `\n\n# 状态机指令(系统跟踪, 请严格遵循)
问卷已全部完成. 请按照完成行为规则:
1. 从用户回答中挑两三个有意思的回答回顾
2. 根据信息推荐对口导师(只能推荐 Lydia/Winnie/Tina, 禁止编造)
3. 无匹配时说: 目前还没有特别匹配的导师, 不如去行业导师那边转一转
4. 在回复末尾添加 [QUESTIONNAIRE_COMPLETED]`;
  }

  let hint = `\n\n# 状态机指令(系统跟踪, 请严格遵循)
你现在应该问第 ${currentQuestion.id} 题: 「${currentQuestion.text}」

规则:
- 只问这一题, 不要跳到其他问题
- 用你自然的风格组织语言, 但问题的核心内容必须与上面一致
- 不要提及题号`;

  if (currentQuestion.options && currentQuestion.options.length > 0) {
    hint += `\n- 这是选择题, 必须使用 [CHOICE] 标签呈现选项`;
  }

  if (currentQuestion.followUp && currentQuestion.followUp.length > 0) {
    hint += `\n- 根据用户回答追问:`;
    for (const fu of currentQuestion.followUp) {
      hint += `\n  - 如果回答包含"${fu.match}", 追问"${fu.question}"`;
    }
  }

  return hint;
}

export function getAllChoiceQuestions(): Question[] {
  return Object.values(questions).filter(
    (q) => q.options && q.options.length > 0 && !q.isLast
  );
}