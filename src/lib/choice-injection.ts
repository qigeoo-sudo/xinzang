/**
 * 服务端自动注入 CHOICE 标签
 *
 * LLM 不总是遵守 prompt 中的格式要求，有时会用纯文字提问选择题。
 * 此模块在服务端检测 AI 回复中是否缺少 CHOICE 标签，
 * 如果当前应该问选择题，则自动追加 [CHOICE] 块到回复末尾。
 */

interface ChoiceQuestion {
  id: string;
  keywords: string[];
  choiceBlock: string;
}

// 所有选择题定义（按提问顺序）
const CHOICE_QUESTIONS: ChoiceQuestion[] = [
  {
    id: 'A4',
    keywords: ['状态', '在校', '在职', '待业'],
    choiceBlock: `\n[CHOICE:type=single]
在校
在职
待业
[/CHOICE]`,
  },
  {
    id: 'A9',
    keywords: ['获取', '职业有关的信息', '信息渠道', '从哪里获取'],
    choiceBlock: `\n[CHOICE:type=multi]
小红书
抖音
B站
知乎
微信公众号
学校就业中心
朋友或同学推荐
招聘平台
其他渠道
[/CHOICE]`,
  },
  {
    id: 'A11',
    keywords: ['最需要帮助', '场景', '需要帮助的是'],
    choiceBlock: `\n[CHOICE:type=single]
不知道适合什么方向/看不到发展路径
知道方向但不知道怎么准备/技能瓶颈需要提升建议
正在求职需要面试指导/向上沟通人际关系困难
拿到offer需要选择谈判/想转行跳槽不确定方向
已入职遇到适应困难/薪资谈判晋升面谈需要策略
[/CHOICE]`,
  },
  {
    id: 'G1',
    keywords: ['深聊', '哪类人'],
    choiceBlock: `\n[CHOICE:type=single]
资深HR
同行业前辈
跨行业年轻职场人
职业规划师
[/CHOICE]`,
  },
  {
    id: 'G2',
    keywords: ['导师', '哪些方面', '最多帮助'],
    choiceBlock: `\n[CHOICE:type=multi]
帮我看清自己适合什么
告诉我行业岗位的真实情况
教我具体的求职技巧
受挫时给鼓励复盘或帮我做具体决策
其他
[/CHOICE]`,
  },
  {
    id: 'G3',
    keywords: ['第一反应', 'Career Companion'],
    choiceBlock: `\n[CHOICE:type=single]
很感兴趣一定会试用
有点兴趣可能会试用
不太感兴趣可能不会试用
完全没兴趣
[/CHOICE]`,
  },
  {
    id: 'G4',
    keywords: ['什么情况下', '打开', '产品'],
    choiceBlock: `\n[CHOICE:type=multi]
遇到新的职业问题时
收到推送提醒时
朋友推荐时
其他
[/CHOICE]`,
  },
  {
    id: 'G5',
    keywords: ['最担心什么', '担心'],
    choiceBlock: `\n[CHOICE:type=multi]
AI建议不靠谱太模板化
隐私泄露对话内容被看到
不如跟真人聊
导师是假的不是真人经验
用了没什么实际帮助
其他
[/CHOICE]`,
  },
  {
    id: 'G6',
    keywords: ['付费', '每月付多少', '愿意'],
    choiceBlock: `\n[CHOICE:type=single]
不愿意付费
10元以内每月
10到30元每月
30到50元每月
50到100元每月
100元以上每月
[/CHOICE]`,
  },
  {
    id: 'G7',
    keywords: ['学校提供', '免费', '优惠', '会用'],
    choiceBlock: `\n[CHOICE:type=single]
一定会用学校应该提供
可能会用取决于好不好
不太想用
无所谓
[/CHOICE]`,
  },
];

/**
 * 检测 AI 回复是否应该包含选择题选项，
 * 如果应该包含但 AI 没有输出 [CHOICE] 标签，则追加相应选项块。
 */
export function injectChoiceIfMissing(reply: string, userMessage?: string): string {
  // 如果回复中已有 [CHOICE 标签，不需要注入
  if (reply.includes('[CHOICE')) {
    return reply;
  }

  // 检测回复是否包含 [QUESTIONNAIRE_COMPLETED] 标记
  if (reply.includes('[QUESTIONNAIRE_COMPLETED]')) {
    return reply;
  }

  // 遍历所有选择题，检测 AI 回复是否在问某道选择题
  for (const q of CHOICE_QUESTIONS) {
    // 匹配条件：回复中包含至少 2 个关键词
    const matchCount = q.keywords.filter((kw) => reply.includes(kw)).length;
    if (matchCount >= 2) {
      // A4 特殊处理：如果用户已回答状态问题，不再注入状态选择题
      if (q.id === 'A4' && userMessage) {
        const statusOptions = ['在校', '在职', '待业'];
        if (statusOptions.some((opt) => userMessage.includes(opt))) {
          continue;
        }
      }
      // 追加 CHOICE 块到回复末尾
      return reply.trimEnd() + q.choiceBlock;
    }
  }

  return reply;
}
