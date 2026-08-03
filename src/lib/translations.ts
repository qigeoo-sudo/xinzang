export type Lang = "zh" | "en";

export const translations = {
  // ========== Navbar ==========
  nav: {
    home: { zh: "首页", en: "Home" },
    chat: { zh: "AI职导", en: "AI Guider" },
    mentors: { zh: "行业导师", en: "Mentors" },
    dashboard: { zh: "成长追踪", en: "Growth" },
    history: { zh: "对话记录", en: "History" },
    login: { zh: "登录", en: "Login" },
    register: { zh: "注册", en: "Sign Up" },
    premium: { zh: "升级会员", en: "Go Premium" },
    tagline: { zh: "你的 AI 职业伙伴", en: "Your AI Career Companion" },
  },

  // ========== Homepage ==========
  home: {
    heroTitle1: { zh: "每个年轻人的", en: "Every Young Person's" },
    heroTitle2: { zh: "AI 职业伙伴", en: "AI Career Companion" },
    cta1: { zh: "与AI职导对话", en: "Chat with AI Guider" },
    cta2: { zh: "浏览行业导师", en: "Browse Mentors" },
    stat1: { zh: "已上线导师", en: "Online Mentors" },
    stat2: { zh: "行业覆盖", en: "Industries" },
    stat3: { zh: "随时陪伴", en: "24/7 Support" },
    pillar1Title: { zh: "智能引导", en: "Smart Guidance" },
    pillar1Desc: {
      zh: "AI 职导不给你标准答案，而是通过提问帮你理清方向。知道自己是谁，比选对赛道更重要。",
      en: "Your AI guider doesn't give standard answers — it asks questions to help you find clarity. Knowing who you are matters more than choosing the right track.",
    },
    pillar2Title: { zh: "真实连接", en: "Real Connections" },
    pillar2Desc: {
      zh: "行业导师 AI 分身，拥有真实访谈知识库。不是泛泛而谈，而是来自一线的实战洞察。",
      en: "Industry veteran AI avatars with real interview knowledge bases. Not generic advice, but frontline insights from the trenches.",
    },
    pillar3Title: { zh: "温暖陪伴", en: "Warm Companionship" },
    pillar3Desc: {
      zh: "AI + 真实人脉 + 成长追踪，三层陪伴体系。从迷茫到清晰，每一步都被看见。",
      en: "AI + real network + growth tracking. Three layers of support. From confusion to clarity, every step is seen.",
    },
    howTitle: { zh: "怎么用？", en: "How It Works" },
    howSubtitle: { zh: "三步开始你的职业探索之旅", en: "Three steps to start your career exploration" },
    step1Title: { zh: "和 AI 职导聊天", en: "Chat with AI Guider" },
    step1Desc: { zh: "说出你的困惑，AI 职导通过提问帮你理清自己", en: "Share your concerns, the AI guider helps you think clearly through questions" },
    step2Title: { zh: "选行业导师对话", en: "Talk to Industry Veterans" },
    step2Desc: { zh: "AI 职导帮你引荐，找到匹配的行业导师深入聊", en: "The AI guider refers you to matching industry veterans for deeper conversations" },
    step3Title: { zh: "追踪你的成长", en: "Track Your Growth" },
    step3Desc: { zh: "每次对话都在积累，看见自己的变化轨迹", en: "Every conversation adds up — see your transformation over time" },
    mentorTitle: { zh: "明星导师", en: "Featured Mentors" },
    mentorSubtitle: { zh: "拥有真实访谈知识库的行业导师", en: "Industry veterans with real interview knowledge bases" },
    viewAll: { zh: "查看全部", en: "View All" },
    ctaTitle: { zh: "AI 时代，我该培养什么能力？", en: "In the AI Era, What Skills Should I Build?" },
    ctaDesc: {
      zh: "不再只是选哪个专业，而是找到你的方向。和 AI 职导聊聊，开始你的探索。",
      en: "It's no longer just about choosing a major — it's about finding your direction. Chat with the AI guider to start exploring.",
    },
    ctaBtn: { zh: "与AI职导对话", en: "Chat with AI Guider" },
    available: { zh: "可对话", en: "Available" },
    roleTemplate: { zh: "{role} · {company} · {years}年经验", en: "{role} · {company} · {years}y exp" },
  },

  // ========== Chat Interface ==========
  chat: {
    aiMentorName: { zh: "AI 职业导师", en: "AI Career Mentor" },
    aiMentorTag: { zh: "AI 职业导师", en: "AI Career Mentor" },
    mentorTag: { zh: "行业导师 AI 分身", en: "Industry Veteran AI" },
    newChat: { zh: "新对话", en: "New Chat" },
    inputPlaceholder: { zh: "说说你的困惑，比如：我适合什么方向？", en: "Share your concern, e.g.: What direction suits me?" },
    inputPlaceholderMentor: { zh: "问问 {name} 关于行业的问题...", en: "Ask {name} about the industry..." },
    welcomeMentor: {
      zh: "你好！我是{name}。你可以问我关于行业、求职、职业发展的任何问题，我会用我真实的经验来回答你。",
      en: "Hello! I'm {name}. You can ask me anything about the industry, job hunting, or career development. I'll answer with my real experience.",
    },
    welcomeAI: {
      zh: "你好！我是你的 AI 职业导师。\n\n我不会直接给你答案——我的方式是通过提问帮你理清自己的状态和需求。当你需要具体行业洞察时，我会帮你找到对的人。\n\n你现在的状态是什么？在校探索、准备求职、还是刚入职场？",
      en: "Hello! I'm your AI Career Mentor.\n\nI won't give you direct answers — my approach is to help you clarify your situation and needs through questions. When you need specific industry insights, I'll help you find the right person.\n\nWhat's your current situation? Still exploring in school, preparing for job hunting, or just started your career?",
    },
    errorNetwork: { zh: "网络出了点问题，请稍后再试。", en: "Network issue, please try again later." },
    errorFallback: { zh: "抱歉，我没能理解。能换个方式说说吗？", en: "Sorry, I didn't quite understand. Could you rephrase?" },
    quickQ1: { zh: "我喜欢AI，但不知道适合技术还是产品", en: "I like AI, but not sure if I fit tech or product roles" },
    quickQ2: { zh: "我是海归硕士，回国找工作该注意什么？", en: "I'm a returning master's grad, what should I know about job hunting?" },
    quickQ3: { zh: "不确定自己适合什么方向怎么办？", en: "What if I'm not sure what direction suits me?" },
    quickQMentor1: { zh: "你面试时最看重候选人的什么特质？", en: "What traits do you value most in candidates?" },
    quickQMentor2: { zh: "对应届生有什么建议？", en: "Any advice for fresh graduates?" },
    quickQMentor3: { zh: "这个行业最大的误区是什么？", en: "What's the biggest misconception about this industry?" },
    titleNewChat: { zh: "开始新对话", en: "Start a new conversation" },
  },

  // ========== Mentor List ==========
  mentorList: {
    badge: { zh: "真实访谈知识库", en: "Real Interview Knowledge Base" },
    title: { zh: "行业导师 AI 分身", en: "Industry Veteran AI Avatars" },
    subtitle: {
      zh: "不是普通 AI 聊天机器人 — 核心资产是汇聚真实职业智慧的全球人脉网络",
      en: "Not just a chatbot — the core asset is a global network of real career wisdom",
    },
    allIndustries: { zh: "全部", en: "All" },
    realKnowledge: { zh: "真实知识", en: "Real Knowledge" },
    available: { zh: "可对话", en: "Available" },
    yearsExp: { zh: "{years} 年经验", en: "{years}y experience" },
    free: { zh: "免费体验", en: "Free Trial" },
    perChat: { zh: "¥{price}/次", en: "¥{price}/chat" },
    viewDetail: { zh: "查看详情", en: "View Details" },
  },

  // ========== Mentor Detail ==========
  mentorDetail: {
    realKnowledge: { zh: "真实知识库", en: "Real Knowledge Base" },
    available: { zh: "可对话", en: "Available" },
    role: { zh: "角色", en: "Role" },
    companyType: { zh: "公司类型", en: "Company Type" },
    yearsExp: { zh: "{years} 年经验", en: "{years} years experience" },
    free: { zh: "免费", en: "Free" },
    perChat: { zh: "每次对话", en: "per chat" },
    experiencing: { zh: "体验中", en: "In Trial" },
    knowledgeTitle: { zh: "导师知识领域", en: "Mentor Knowledge Areas" },
    chatWith: { zh: "和 {name} 对话", en: "Chat with {name}" },
    comingSoon: { zh: "该导师即将上线", en: "Coming Soon" },
    comingSoonDesc: { zh: "{name} 的 AI 分身正在训练中，敬请期待", en: "{name}'s AI avatar is in training, stay tuned" },
    notifyBtn: { zh: "预约通知", en: "Notify Me" },
    realPersonTitle: { zh: "想和真人聊？", en: "Want to talk to a real person?" },
    realPersonDesc: { zh: "申请与 {name} 本人进行一对一交流", en: "Apply for a 1-on-1 with {name}" },
    realPersonBtn: { zh: "申请真人联系", en: "Request Real Contact" },
  },

  // ========== Dashboard ==========
  dashboard: {
    title: { zh: "成长追踪", en: "Growth Tracking" },
    subtitle: { zh: "从校园到职场的持续陪伴，看见自己的成长轨迹", en: "Continuous companionship from campus to career, see your growth trajectory" },
    statChats: { zh: "对话次数", en: "Conversations" },
    statDirections: { zh: "探索方向", en: "Directions" },
    statMentorChats: { zh: "导师对话", en: "Mentor Chats" },
    statMilestones: { zh: "成长里程碑", en: "Milestones" },
    careerMatch: { zh: "职业方向匹配", en: "Career Direction Match" },
    milestonesTitle: { zh: "成长里程碑", en: "Growth Milestones" },
    milestonesProgress: { zh: "{done}/{total} 完成", en: "{done}/{total} completed" },
    recentChats: { zh: "最近对话", en: "Recent Conversations" },
    startNew: { zh: "开始新的对话", en: "Start a new conversation" },
    milestone1Title: { zh: "完成职业画像", en: "Complete Career Profile" },
    milestone1Desc: { zh: "兴趣、性格、技能评估完成", en: "Interests, personality, skills assessment completed" },
    milestone2Title: { zh: "首次 AI 职导对话", en: "First AI Guider Chat" },
    milestone2Desc: { zh: "和 AI 职业导师聊了职业方向", en: "Chatted with AI Career Mentor about career direction" },
    milestone3Title: { zh: "探索 3 个职业方向", en: "Explore 3 Career Directions" },
    milestone3Desc: { zh: "AI产品经理、HR、数据分析", en: "AI PM, HR, Data Analysis" },
    milestone4Title: { zh: "和行业导师对话", en: "Talk to Industry Veteran" },
    milestone4Desc: { zh: "选择一位行业导师深入交流", en: "Choose a veteran for in-depth conversation" },
    milestone5Title: { zh: "完成面试模拟", en: "Complete Mock Interview" },
    milestone5Desc: { zh: "至少完成 1 次模拟面试", en: "Complete at least 1 mock interview" },
  },

  // ========== Chat History ==========
  history: {
    title: { zh: "对话记录", en: "Chat History" },
    subtitle: { zh: "你的所有对话历史", en: "All your conversation history" },
    sortByTime: { zh: "按时间排序", en: "Sort by Time" },
    sortByName: { zh: "按导师排序", en: "Sort by Mentor" },
    noHistory: { zh: "还没有对话记录", en: "No conversations yet" },
    noHistoryDesc: { zh: "开始你的第一次对话吧", en: "Start your first conversation" },
    startChat: { zh: "开始对话", en: "Start Chatting" },
    delete: { zh: "删除", en: "Delete" },
    back: { zh: "返回", en: "Back" },
    messages: { zh: "{count} 条消息", en: "{count} messages" },
    aiMentor: { zh: "AI职导", en: "AI Guider" },
    emptyChat: { zh: "暂无消息", en: "No messages" },
    resumeChat: { zh: "继续对话", en: "Resume Chat" },
    confirmDelete: { zh: "确定删除这条对话记录吗？", en: "Delete this conversation?" },
  },
} as const;

// Helper type for getting translation keys
export type TranslationKey = typeof translations;
