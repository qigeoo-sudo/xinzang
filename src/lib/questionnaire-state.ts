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
    text: '你是哪一年入学的?',
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
    field: 'goals',
    followUp: [
      { match: '喜欢', question: '喜欢哪里?' },
      { match: '不喜欢', question: '为什么不喜欢? 真正喜欢的专业是什么?' },
    ],
    nextId: 'C1',
  },
  S3_F1: {
    id: 'S3_F1',
    text: '喜欢哪里?',
    type: 'open',
    field: 'interests',
    nextId: 'C1',
  },
  S3_F2: {
    id: 'S3_F2',
    text: '为什么不喜欢? 真正喜欢的专业是什么?',
    type: 'open',
    field: 'interests',
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
    nextId: 'E6',
  },
  E6: {
    id: 'E6',
    text: '请问你对目前工作满意吗?用1~5打分。',
    type: 'choice-single',
    options: ['1分 很不满意', '2分 不太满意', '3分 一般满意', '4分 比较满意', '5分 非常满意'],
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
    text: '之前的公司是什么类型?',
    type: 'choice-single',
    options: ['国企', '民企', '外企', '创业公司', '互联网', '其他'],
    field: 'companyType',
    nextId: 'U5',
  },
  U5: {
    id: 'U5',
    text: '离职多久了?',
    type: 'open',
    nextId: 'U6',
  },
  U6: {
    id: 'U6',
    text: '最近六个月有没有认真找过工作?',
    type: 'choice-single',
    options: ['一直在找', '断断续续在找', '最近开始找', '还没开始找'],
    field: 'jobChangeStatus',
    nextId: 'U7',
  },
  U7: {
    id: 'U7',
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
    nextId: 'C2_F1',
  },
  C2_F1: {
    id: 'C2_F1',
    text: '这些渠道里你最依赖哪个? 为什么?',
    type: 'open',
    nextId: 'C3',
  },
  C3: {
    id: 'C3',
    text: '过去一年, 你在职业发展上大概花了多少钱? 包括简历修改, 面试辅导, 职业咨询, 付费课程, 付费社群, 考证培训等.',
    type: 'choice-single',
    options: ['没花钱', '1~100元', '101~500元', '501~2000元', '2001~6000元', '6000元以上'],
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
    text: '你对我们这个AI产品的第一反应是什么?',
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
    text: '如果学校、公司或社会机构提供这个工具(免费或优惠), 你会用吗?',
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

function matchesAnyOption(userAnswer: string, options?: string[]): boolean {
  if (!options || options.length === 0) return true;
  const answer = userAnswer.trim();
  return options.some((opt) => answer.includes(opt) || opt.includes(answer));
}

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

  // 选择题: 答案需匹配某选项才推进，否则保持当前题
  if (currentQ.type !== 'open' && currentQ.options) {
    if (matchesAnyOption(userAnswer, currentQ.options)) {
      if (currentQ.nextId) return { question: questions[currentQ.nextId] };
      return { question: questions.END };
    }
    return { question: currentQ };
  }

  // 开放题: 检查条件追问 (如 S3: 喜欢→S3_F1, 不喜欢→S3_F2)
  if (currentQ.followUp && currentQ.followUp.length > 0) {
    const sortedFollowUp = [...currentQ.followUp]
      .sort((a, b) => b.match.length - a.match.length);
    for (const fu of sortedFollowUp) {
      if (fu.match === '__multi__') continue;
      if (userAnswer.includes(fu.match)) {
        const originalIndex: number = currentQ.followUp.indexOf(fu);
        const followUpId = currentQ.id + '_F' + (originalIndex + 1);
        if (questions[followUpId]) {
          return { question: questions[followUpId] };
        }
      }
    }
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
  // Strip [QUESTIONNAIRE_COMPLETED] marker — completion detected via state machine
  let cleaned = reply.replace(/\[QUESTIONNAIRE_COMPLETED\]/gi, '').trim();
  cleaned = cleaned.replace(/\[CHOICE[^\]]*\][\s\S]*?\[\/CHOICE\]/gi, '').trim();
  cleaned = cleaned.replace(/\[\/?CHOICE[^\]]*\]/gi, '').trim();
  if (!currentQuestion.options || currentQuestion.options.length === 0) return cleaned;
  // If reply after cleaning is too short (AI didn't output the question text), prepend it
  if (cleaned.length < 5) {
    cleaned = currentQuestion.text;
  }
  return cleaned.trimEnd() + formatChoiceTag(currentQuestion);
}

export function buildStateHint(currentQuestion: Question): string {
  if (currentQuestion.isLast) {
    return `\n\n# 状态机指令(系统跟踪, 请严格遵循)
问卷已全部完成. 请按照完成行为规则:
1. 从用户回答中挑两三个有意思的回答回顾
2. 根据信息推荐对口导师(只能推荐 Lydia/Winnie/Tina, 禁止编造). 推荐时在回复末尾另起一行用标记格式列出: [mentor:lydia] [mentor:winnie] [mentor:tina]
3. 无匹配时说: 目前还没有特别匹配的导师, 不如去行业导师那边转一转`;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  let hint = `\n\n# 状态机指令(系统跟踪, 请严格遵循)
你现在应该问第 ${currentQuestion.id} 题: 「${currentQuestion.text}」

规则:
- 只问这一题, 不要跳到其他问题
- 用你自然的风格组织语言, 但问题的核心内容必须与上面一致
- 不要提及题号
- 不要问已知信息能推算出的问题
- 不要在回复中列出任何选择题的选项文本, 包括当前题和后面题目的选项, 系统会自动追加正确选项
- 当前日期: ${dateStr}, 推算时间相关信息时以这个日期为准`;

  if (currentQuestion.options && currentQuestion.options.length > 0) {
    hint += `\n- 当前题是选择题, 系统会在回复末尾自动追加选项, 你只需问出问题本身`;
  }

  return hint;
}

export function getAllChoiceQuestions(): Question[] {
  return Object.values(questions).filter(
    (q) => q.options && q.options.length > 0 && !q.isLast
  );
}

// ============================================================
// 硬逻辑: 用户答案直接映射到 UserProfile 字段
// ============================================================

const SENSITIVE_WORDS = [
  '色情', '淫秽', '卖淫', '嫖娼', '裸体', '性交', '做爱', '黄片',
  '杀戮', '杀人', '自杀', '爆炸', '恐怖', '炸弹', '枪击', '分尸',
  '傻逼', '操你', '去死', '废物', '贱人', '婊子',
  '毒品', '贩毒', '诈骗', '赌博', '洗钱',
];

export function containsSensitiveContent(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_WORDS.some((word) => lower.includes(word));
}

const ARRAY_FIELDS = new Set([
  'interests', 'infoChannels', 'helpPriority', 'mentorPreference',
  'mentorHelpAreas', 'productTrigger', 'productConcern',
]);

const SKIP_FIELDS = new Set([
  'goals',           // 有followUp，答案分散在多条消息
]);

function matchOptionSingle(answer: string, options: string[]): string | null {
  const trimmed = answer.trim();
  const exact = options.find((o) => o === trimmed);
  if (exact) return exact;
  const partial = options.find((o) => trimmed.includes(o));
  if (partial) return partial;
  const reverse = options.find((o) => o.includes(trimmed) && trimmed.length >= 2);
  if (reverse) return reverse;
  return null;
}

function matchOptionMulti(answer: string, options: string[]): string[] {
  return options.filter((o) => answer.includes(o));
}

export function extractAnswer(
  step: string | null,
  userAnswer: string
): { field: string; dbValue: string | number } | null {
  if (!step || step === 'null') return null;
  const q = questions[step];
  if (!q || !q.field) return null;

  const fields = Array.isArray(q.field) ? q.field : [q.field];
  if (fields.length > 1) return null; // 多字段开放题，交给extract API

  const field = fields[0];
  if (SKIP_FIELDS.has(field)) return null;

  // 选择题 - 单选
  if (q.type === 'choice-single' && q.options) {
    const matched = matchOptionSingle(userAnswer, q.options) || userAnswer.trim();
    // jobSatisfaction: 从选项中提取数字 (如 "4分 比较满意" → 4)
    if (field === 'jobSatisfaction') {
      const numMatch = matched.match(/^(\d)/);
      if (numMatch) {
        return { field, dbValue: parseInt(numMatch[1], 10) };
      }
      const numFromAnswer = userAnswer.match(/(\d)/);
      if (numFromAnswer) {
        return { field, dbValue: parseInt(numFromAnswer[1], 10) };
      }
      return null;
    }
    if (ARRAY_FIELDS.has(field)) {
      return { field, dbValue: JSON.stringify([matched]) };
    }
    return { field, dbValue: matched };
  }

  // 选择题 - 多选
  if (q.type === 'choice-multi' && q.options) {
    const matched = matchOptionMulti(userAnswer, q.options);
    const arr = matched.length > 0 ? matched : [userAnswer.trim()];
    return { field, dbValue: JSON.stringify(arr) };
  }

  // 开放题 - 敏感词检查 (适用于所有开放题)
  if (q.type === 'open' && containsSensitiveContent(userAnswer)) {
    return null;
  }

  // 开放题 - 数字字段 (age)
  if (field === 'age') {
    const num = parseInt(userAnswer.trim(), 10);
    if (!isNaN(num) && num > 0 && num <= 150) {
      return { field, dbValue: num };
    }
    return null;
  }

  // 开放题 - 字符串字段
  const trimmed = userAnswer.trim();
  if (!trimmed || trimmed === '跳过') return null;
  if (ARRAY_FIELDS.has(field)) {
    return { field, dbValue: JSON.stringify([trimmed]) };
  }
  return { field, dbValue: trimmed };
}
