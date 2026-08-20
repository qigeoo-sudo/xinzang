'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { mentors, type Mentor } from '@/lib/mentors';
import { MessageWithChoices } from '@/components/chat-options';
import { CollapsibleText } from '@/components/collapsible-text';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

interface MentorChatProps {
  mentor: Mentor;
}

// localStorage 键名 — 按用户+导师区分，确保对话记录隔离
const getStorageKey = (userId: string, mentorId: string, type: string) => `chat-${type}-${userId}-${mentorId}`;

// AI 职导专用键生成器（按用户隔离）
const getAiGuideKeys = (userId: string) => ({
  messages: `ai-guide-messages-${userId}`,
  limitTs: `ai-guide-limit-timestamp-${userId}`,
  sessionId: `ai-guide-session-id-${userId}`,
  completed: `ai-guide-completed-${userId}`,
  version: `ai-guide-version-${userId}`,
});

// AI 职导 localStorage 数据版本 — 版本不匹配时清空旧数据重新开始
const AI_GUIDE_VERSION = 'v2-student-only';

// 24小时毫秒数
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// --- 需求4: 问卷完成消息动态生成辅助函数 ---

// 安全解析 JSON 数组字符串
function parseJsonArraySafe(str: string | null | undefined): string[] {
  if (!str) return [];
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 通过名称查找导师（支持部分匹配）
function findMentorByName(name: string) {
  return mentors.find(
    (m) =>
      m.id !== 'ai-guide' &&
      (m.name === name ||
        m.name.startsWith(name) ||
        name.startsWith(m.name.split(' ')[0]))
  );
}

// 截断到指定长度
function truncateText(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen);
}

// 根据档案数据动态生成问卷完成消息
function generateCompletionMessage(profile: {
  careerAnxiety?: string | null;
  helpPriority?: string | null;
  recommendedMentors?: string | null;
}): string {
  // 确定用户的主要困惑
  let concern = '';
  if (profile.careerAnxiety) {
    concern = profile.careerAnxiety;
  } else {
    const priorities = parseJsonArraySafe(profile.helpPriority);
    if (priorities.length > 0) {
      concern = priorities[0];
    }
  }

  // 解析推荐导师
  const recommendedNames = parseJsonArraySafe(profile.recommendedMentors);

  // 构建导师信息（名称 + 简介不超过25字）
  const mentorInfos: { name: string; shortDesc: string }[] = [];
  for (const name of recommendedNames) {
    const mentor = findMentorByName(name);
    if (mentor) {
      mentorInfos.push({
        name: mentor.name,
        shortDesc: truncateText(mentor.tagline, 25),
      });
    }
  }

  let message = '祝贺！我们完成了交流访谈。';
  if (concern) {
    message += `根据目前我收集的信息，你主要的困惑是${concern}。`;
  } else {
    message += '根据目前我收集的信息，目前我还不清楚你主要的困惑。';
  }

  if (mentorInfos.length > 0) {
    const names = mentorInfos.map((m) => m.name);
    if (names.length === 1) {
      message += `结合各方面信息，我向你推荐${names[0]}导师分身。`;
    } else {
      message += `结合各方面信息，我向你推荐${names.slice(0, -1).join('、')}以及${names[names.length - 1]}导师分身。`;
    }
    message += '\n\n' + mentorInfos.map((m) => `${m.name}：${m.shortDesc}`).join('\n');
  }

  return message;
}

export function MentorChat({ mentor }: MentorChatProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [questionnaireCompleted, setQuestionnaireCompleted] = useState(false);
  const [needSubscription, setNeedSubscription] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [usageUsed, setUsageUsed] = useState<number>(0);
  const [usageLimit, setUsageLimit] = useState<number | null>(null);
  const [profileData, setProfileData] = useState<{
    careerAnxiety?: string | null;
    helpPriority?: string | null;
    recommendedMentors?: string | null;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初始化：检查 localStorage 状态，支持所有导师的断点续传
  useEffect(() => {
    if (initialized) return;
    if (status === 'loading') return;

    // 未登录时不加载 localStorage — 确保对话记录隔离
    if (status === 'unauthenticated' || !session?.user?.id) {
      setInitialized(true);
      return;
    }

    // 获取当前用量数据
    fetch('/api/chat/usage')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          if (mentor.id === 'ai-guide') {
            setUsageUsed(data.aiGuide?.used ?? 0);
            setUsageLimit(data.aiGuide?.limit ?? 50);
          } else {
            setUsageUsed(data.mentor?.used ?? 0);
            setUsageLimit(data.mentor?.limit ?? null);
          }
        }
      })
      .catch(() => {});

    const userId = session.user.id;
    const isAiGuide = mentor.id === 'ai-guide';
    // 获取存储键（AI 职导用专用键，其他导师用通用键 — 均按用户隔离）
    const aiKeys = isAiGuide ? getAiGuideKeys(userId) : null;
    const msgKey = isAiGuide ? aiKeys!.messages : getStorageKey(userId, mentor.id, 'messages');
    const sidKey = isAiGuide ? aiKeys!.sessionId : getStorageKey(userId, mentor.id, 'session-id');
    const limitKey = isAiGuide ? aiKeys!.limitTs : null;
    const completedKey = isAiGuide ? aiKeys!.completed : null;

    try {
      const savedMessages = localStorage.getItem(msgKey);
      const savedSessionId = localStorage.getItem(sidKey);

      // AI 职导专属：版本检查 — 旧版数据（含在校/在职/待业选择题）需清空重来
      if (isAiGuide && aiKeys) {
        const savedVersion = localStorage.getItem(aiKeys.version);
        if (savedVersion !== AI_GUIDE_VERSION) {
          // 版本不匹配 — 清空所有旧数据，从头开始
          localStorage.removeItem(msgKey);
          localStorage.removeItem(sidKey);
          if (limitKey) localStorage.removeItem(limitKey);
          if (completedKey) localStorage.removeItem(completedKey);
          localStorage.setItem(aiKeys.version, AI_GUIDE_VERSION);
          // 不恢复旧对话，直接走 loadFromDatabase → 欢迎消息流程
          loadFromDatabase();
          return;
        }
      }

      // AI 职导专属：检查每日限额
      if (isAiGuide && limitKey) {
        const limitTimestamp = localStorage.getItem(limitKey);
        const completed = completedKey ? localStorage.getItem(completedKey) === 'true' : false;

        if (limitTimestamp) {
          const limitTime = parseInt(limitTimestamp, 10);
          const elapsed = Date.now() - limitTime;

          if (elapsed >= ONE_DAY_MS) {
            // 24小时已过 — 清零并重启问卷
            localStorage.removeItem(msgKey);
            localStorage.removeItem(sidKey);
            localStorage.removeItem(limitKey);
            if (completedKey) localStorage.removeItem(completedKey);
            setMessages([]);
            setSessionId(null);
            setDailyLimitReached(false);
            setQuestionnaireCompleted(false);
            setInitialized(true);
            return;
          } else {
            // 24小时未过 — 仍处于限额状态
            setDailyLimitReached(true);
            setError('在我这里，一天最多发送50条消息，明天再来吧。');
            if (savedMessages) {
              const parsed = JSON.parse(savedMessages) as ChatMessage[];
              setMessages(parsed);
            }
            if (savedSessionId) {
              setSessionId(savedSessionId);
            }
            setQuestionnaireCompleted(completed);
            setInitialized(true);
            return;
          }
        }
      }

      // 有保存的消息 — 从 localStorage 恢复
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages) as ChatMessage[];
        if (parsed.length > 0) {
          setMessages(parsed);
          if (savedSessionId) {
            setSessionId(savedSessionId);
          }
          if (isAiGuide) {
            // AI 职导：不信任 localStorage 的 completed 标记
            // 先用 localStorage 值作为临时显示，然后异步向数据库验证
            const localCompleted = completedKey ? localStorage.getItem(completedKey) === 'true' : false;
            setQuestionnaireCompleted(localCompleted);
            setInitialized(true);

            // 异步验证：数据库是权威源
            if (localCompleted) {
              fetch('/api/user/profile')
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                  const profile = data?.profile;
                  const dbCompleted =
                    profile?.profileSource === 'ai_extracted' ||
                    (profile?.nickname != null && profile.nickname.length > 0);
                  if (!dbCompleted) {
                    // 数据库说未完成 — 清除 localStorage 的 completed 标记，回到问卷模式
                    if (completedKey) localStorage.removeItem(completedKey);
                    setQuestionnaireCompleted(false);
                    window.dispatchEvent(new CustomEvent('questionnaireNotCompleted'));
                  } else {
                    // 数据库确认已完成 — 同步档案数据
                    setProfileData(profile);
                  }
                })
                .catch(() => {
                  // 网络错误 — 信任 localStorage 作为 fallback
                });
            }
          } else {
            setInitialized(true);
          }
          return;
        }
      }

      // localStorage 没有数据 — 尝试从数据库加载最近的会话
      loadFromDatabase();
    } catch {
      setInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentor.id, status, initialized, session?.user?.id]);

  // 从数据库加载最近的导师会话（断点续传的数据库回退）
  // 同时检查用户档案 — 数据库为权威源
  const loadFromDatabase = async () => {
    // AI 职导：先检查数据库档案，确定问卷完成状态（数据库为权威源）
    if (mentor.id === 'ai-guide' && session?.user?.id) {
      try {
        const profileRes = await fetch('/api/user/profile');
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          // 判断访谈是否已完成：profileSource 为 ai_extracted 或 nickname 有值
          // 不能仅检查 profile 是否存在，因为注册时会创建空档案
          const profile = profileData?.profile;
          const interviewCompleted =
            profile?.profileSource === 'ai_extracted' ||
            (profile?.nickname != null && profile.nickname.length > 0);

          if (interviewCompleted) {
            // 访谈已完成 — 进入轻量模式
            setQuestionnaireCompleted(true);
            // 存储档案数据用于生成动态欢迎消息
            setProfileData(profile);
            // 同步 localStorage
            try {
              localStorage.setItem(`ai-guide-completed-${session.user.id}`, 'true');
            } catch { /* ignore */ }
            // 通知导航栏锁定
            window.dispatchEvent(new CustomEvent('questionnaireCompleted'));

            // 档案已存在，不需要加载旧问卷对话，直接进入轻量模式
            setInitialized(true);
            return;
          }
        }
      } catch {
        // 数据库检查失败 — 回退到 localStorage
        const isCompleted = localStorage.getItem(`ai-guide-completed-${session.user.id}`) === 'true';
        if (isCompleted) {
          setQuestionnaireCompleted(true);
          setInitialized(true);
          return;
        }
      }
    }

    // 没有档案或非 AI 职导 — 尝试加载历史对话
    try {
      const res = await fetch(`/api/chat/sessions/latest?mentorId=${mentor.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session && data.messages && data.messages.length > 0) {
          const dbMessages: ChatMessage[] = data.messages.map((m: { id: string; role: string; content: string; createdAt: string }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            createdAt: m.createdAt,
          }));
          setMessages(dbMessages);
          setSessionId(data.session.id);

          // 同步到 localStorage（按用户隔离）
          if (session?.user?.id) {
            const userId = session.user.id;
            const isAiGuide = mentor.id === 'ai-guide';
            const aiKeys = isAiGuide ? getAiGuideKeys(userId) : null;
            const msgKey = isAiGuide ? aiKeys!.messages : getStorageKey(userId, mentor.id, 'messages');
            const sidKey = isAiGuide ? aiKeys!.sessionId : getStorageKey(userId, mentor.id, 'session-id');
            localStorage.setItem(msgKey, JSON.stringify(dbMessages));
            localStorage.setItem(sidKey, data.session.id);
          }

          setInitialized(true);
          return;
        }
      }
    } catch {
      // 数据库加载失败，静默处理
    }
    // 没有数据库记录 — 显示初始问候
    setInitialized(true);
  };

  // 初始欢迎消息 — 初始化完成且无保存数据时显示
  // questionnaireCompleted 状态已在初始化阶段从数据库确定，此处同步使用
  useEffect(() => {
    if (!initialized) return;
    // 已有消息（从 localStorage 或数据库恢复）— 不显示欢迎语
    if (messages.length > 0) return;
    // 限额状态下不显示欢迎语
    if (dailyLimitReached) return;

    if (mentor.id === 'ai-guide') {
      if (questionnaireCompleted) {
        // 轻量模式：档案已建立 — 使用动态消息
        const completionMessage = profileData
          ? generateCompletionMessage(profileData)
          : '祝贺！我们完成了交流访谈。现在，你的个人档案已经建立，你可以自行在那里不断更新你的情况，让我们更了解你，更好陪你成长。';
        setMessages([
          {
            role: 'assistant',
            content: completionMessage,
          },
        ]);
      } else {
        // 问卷模式：首次访谈 — AI 主动问 A1
        setMessages([
          {
            role: 'assistant',
            content: `你好！我是AI职导。我会帮你推荐合适的导师分身。\n目前导师分身拥有的知识经验，主要为高校学生求职提供服务，为其他群体提供的服务，会在今后逐渐完善，敬请等待。\n首先，在交流中，让我逐渐建立你的个人档案，可以推荐合适的AI导师分身，并让它的服务更有效率。`,
          },
          {
            role: 'assistant',
            content: `在开始之前，我想先说明一下：我们的所有对话内容，在访谈交流结束后，都会脱敏后记录在后台数据库，数据绝对不会外泄。你可以随时去我的档案更新个人信息。 那么，我们开始吧。`,
          },
          {
            role: 'assistant',
            content: `第一个问题：如何称呼你？多大了？现在是大三还是大四了？（大三升大四算大四，大四最后一学期未结束就算大四。）或者你在其他年级？`,
          },
        ]);
      }
    } else {
      setMessages([
        {
          role: 'assistant',
          content: `你好！我是${mentor.name}。你可以问我关于行业、求职、职业发展的任何问题，我会用我真实的经验来回答你。`,
        },
      ]);
    }
  }, [mentor.id, mentor.name, initialized, dailyLimitReached, questionnaireCompleted, profileData]);

  // 保存消息到 localStorage — 按用户+导师隔离
  const saveMessages = (msgs: ChatMessage[], sid: string | null) => {
    if (!session?.user?.id) return;
    try {
      const userId = session.user.id;
      const isAiGuide = mentor.id === 'ai-guide';
      const aiKeys = isAiGuide ? getAiGuideKeys(userId) : null;
      const msgKey = isAiGuide ? aiKeys!.messages : getStorageKey(userId, mentor.id, 'messages');
      const sidKey = isAiGuide ? aiKeys!.sessionId : getStorageKey(userId, mentor.id, 'session-id');
      localStorage.setItem(msgKey, JSON.stringify(msgs));
      if (sid) {
        localStorage.setItem(sidKey, sid);
      }
      // AI 职导：同时保存版本标签
      if (isAiGuide && aiKeys) {
        localStorage.setItem(aiKeys.version, AI_GUIDE_VERSION);
      }
    } catch {
      // localStorage 不可用时静默失败
    }
  };

  // 检测问卷完成标记
  const checkCompletion = (content: string): { content: string; completed: boolean } => {
    if (mentor.id !== 'ai-guide') {
      return { content, completed: false };
    }
    const marker = '[QUESTIONNAIRE_COMPLETED]';
    if (content.includes(marker)) {
      const cleanContent = content.replace(marker, '').trim();
      return { content: cleanContent, completed: true };
    }
    return { content, completed: false };
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading || dailyLimitReached) return;

    // 未登录提示
    if (status === 'unauthenticated') {
      setShowAuthPrompt(true);
      return;
    }

    if (status === 'loading') return;

    setError('');
    setInput('');
    setNeedSubscription(false);

    // 添加用户消息到 UI
    const userMessage: ChatMessage = {
      role: 'user',
      content: messageText,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      // P0-3: 客户端只发送当前消息，不再发送 messages 数组
      // 服务端从数据库构建对话历史，防止伪造
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentorId: mentor.id,
          message: messageText,
          ...(sessionId ? { sessionId } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // 401 未登录或登录状态失效 — 显示登录/注册引导
        if (res.status === 401) {
          // needRelogin: JWT 中的用户在数据库中不存在（数据库重置等），需要重新登录
          if (data.needRelogin) {
            // 清除本地存储的旧 session 数据
            try {
              if (session?.user?.id) {
                const aiKeys = getAiGuideKeys(session.user.id);
                localStorage.removeItem(aiKeys.messages);
                localStorage.removeItem(aiKeys.sessionId);
                localStorage.removeItem(aiKeys.completed);
                localStorage.removeItem(aiKeys.version);
              }
            } catch { /* ignore */ }
            // 跳转到登录页
            router.push(`/login?callbackUrl=${pathname}`);
            return;
          }
          setShowAuthPrompt(true);
          setMessages(messages);
          setInput(messageText);
          return;
        }
        // 每日限额达到
        if (data.dailyLimitReached) {
          setError(data.error || '在我这里，一天最多发送50条消息，明天再来吧。');
          setDailyLimitReached(true);
          setMessages(messages);
          setInput(messageText);
          // 保存限额时间戳（按用户隔离）
          if (mentor.id === 'ai-guide' && session?.user?.id) {
            try {
              const aiKeys = getAiGuideKeys(session.user.id);
              localStorage.setItem(aiKeys.limitTs, String(Date.now()));
              saveMessages(messages, sessionId);
            } catch {
              // ignore
            }
          }
          return;
        }
        // 消息条数超限
        if (data.error && data.error.includes('一天最多发送50条消息')) {
          setError(data.error);
          setDailyLimitReached(true);
          setMessages(messages);
          setInput(messageText);
          if (mentor.id === 'ai-guide' && session?.user?.id) {
            try {
              const aiKeys = getAiGuideKeys(session.user.id);
              localStorage.setItem(aiKeys.limitTs, String(Date.now()));
              saveMessages(messages, sessionId);
            } catch {
              // ignore
            }
          }
          return;
        }
        if (data.needUpgrade) {
          setNeedSubscription(true);
        } else if (data.needSubscription) {
          setNeedSubscription(true);
        } else if (data.quotaExceeded) {
          setError(data.error || '导师分身对话次数已用完');
          setNeedSubscription(true);
        } else {
          setError(data.error || '发送失败');
        }
        // 移除已添加的用户消息
        setMessages(messages);
        setInput(messageText);
        return;
      }

      // 检测问卷完成标记
      const { content: cleanReply, completed } = checkCompletion(data.reply);

      // 添加 AI 回复
      const finalMessages = [...newMessages, { role: 'assistant' as const, content: cleanReply }];
      setMessages(finalMessages);

      // 保存到 localStorage — 所有导师都保存
      saveMessages(finalMessages, data.sessionId || sessionId);

      // 如果问卷完成，触发事件
      if (completed && !questionnaireCompleted) {
        setQuestionnaireCompleted(true);
        if (mentor.id === 'ai-guide' && session?.user?.id) {
          try {
            const aiKeys = getAiGuideKeys(session.user.id);
            localStorage.setItem(aiKeys.completed, 'true');
          } catch {
            // ignore
          }
          // 自动触发档案提取 — 三步走第三步
          // 等待档案提取完成 + 至少 1.5 秒延迟（让用户读完 AI 最后回复）
          const extractPromise = fetch('/api/profile/extract', { method: 'POST' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);
          const minDelay = new Promise((resolve) => setTimeout(resolve, 1500));

          Promise.all([extractPromise, minDelay]).then(([extractData]) => {
            let message: string;
            if (extractData?.success && extractData.profile) {
              message = generateCompletionMessage(extractData.profile);
              setProfileData(extractData.profile);
            } else {
              message =
                '祝贺！我们完成了交流访谈。现在，你的个人档案已经建立，你可以自行在那里不断更新你的情况，让我们更了解你，更好陪你成长。';
            }

            try {
              const aiKeys = getAiGuideKeys(session.user.id);
              const lightweightMessages: ChatMessage[] = [
                {
                  role: 'assistant',
                  content: message,
                },
              ];
              setMessages(lightweightMessages);
              saveMessages(lightweightMessages, null);
              // 清除旧的 sessionId，开始新的轻量模式会话
              setSessionId(null);
              localStorage.removeItem(aiKeys.sessionId);
            } catch {
              // ignore
            }
          });
        }
        // 延迟触发事件，让 UI 先更新
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('questionnaireCompleted'));
        }, 500);
      }

      // 更新 sessionId — 如果 API 返回了新的 sessionId（可能因为旧 sessionId 过期），则更新
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        saveMessages(finalMessages, data.sessionId);
      }

      // 更新用量计数
      if (mentor.id === 'ai-guide' && data.dailyMessageCount !== undefined) {
        setUsageUsed(data.dailyMessageCount);
        setUsageLimit(data.dailyMessageLimit ?? 50);
      } else if (mentor.id !== 'ai-guide' && data.mentorUsed !== undefined) {
        setUsageUsed(data.mentorUsed);
        setUsageLimit(data.mentorLimit ?? null);
      }
    } catch {
      setError('网络错误，请稍后再试');
      setMessages(messages);
      setInput(messageText);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // 键盘事件处理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 登录引导
  if (showAuthPrompt || status === 'unauthenticated') {
    // AI 职导的未登录提示 — 包含登录和注册链接
    if (mentor.id === 'ai-guide') {
      return (
        <div className="card text-center py-8">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-brand-50 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3482a2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
          </div>
          <p className="text-sm text-brand-900 mb-1">你好！我是AI职导</p>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            为了给你提供个性化的职业引导，请先登录。如果还没有账号，可以注册一个。
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => router.push(`/login?callbackUrl=${pathname}`)}
              className="btn-primary"
            >
              登录
            </button>
            <button
              onClick={() => router.push(`/register?callbackUrl=${pathname}`)}
              className="btn-secondary"
            >
              注册
            </button>
          </div>
        </div>
      );
    }
    // 其他导师的未登录提示
    return (
      <div className="card text-center py-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z"
              stroke="#5B7C5A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-sm text-ink mb-1">登录后可以交谈。</p>
        <p className="text-xs text-muted mb-4">
          成为会员即可与全部导师分身对话
        </p>
        <button
          onClick={() =>
            router.push(`/login?callbackUrl=${pathname}`)
          }
          className="btn-primary"
        >
          去登录
        </button>
      </div>
    );
  }

  // 等待初始化 — 所有导师在加载时显示
  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[400px] w-full">
      {/* 消息列表 */}
      <div className="flex-1 space-y-4 pb-4 w-full">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* AI 头像 */}
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 mr-2">
                {mentor.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mentor.avatar}
                    alt={mentor.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
                    <span className="text-white text-xs font-bold">
                      {mentor.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 消息气泡 */}
            <div
              className={`max-w-[90%] sm:max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-brand-500 text-white rounded-br-md'
                  : 'bg-white border border-slate-100 text-brand-900 rounded-bl-md'
              }`}
            >
              {msg.role === 'assistant' ? (
                msg.content.includes('[CHOICE') ? (
                  <MessageWithChoices
                    content={msg.content}
                    onSelect={(value) => handleSend(value)}
                    disabled={loading || dailyLimitReached}
                    enableMentorLinks={mentor.id === 'ai-guide'}
                  />
                ) : (
                  <CollapsibleText
                    content={msg.content}
                    isUser={false}
                    enableMentorLinks={mentor.id === 'ai-guide'}
                  />
                )
              ) : (
                <CollapsibleText content={msg.content} isUser={true} />
              )}
            </div>
          </div>
        ))}

        {/* 加载指示器 */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex-shrink-0 mr-2">
              {mentor.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mentor.avatar}
                  alt={mentor.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {mentor.name.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="bg-white border border-rule rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="bg-danger/10 text-danger text-xs px-4 py-2 rounded-lg text-center">
            {error}
          </div>
        )}

        {/* 非会员与收费导师对话 — 显示加入会员按钮 */}
        {needSubscription && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-slate-600 text-center">
              成为会员后，即可与{mentor.name}及所有行业导师分身深度对话。
            </p>
            <Link
              href="/dashboard/subscription"
              className="btn-primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                <path d="M5 21h14" />
              </svg>
              加入会员
            </Link>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 推荐问题 */}
      {messages.length <= 1 && !loading && mentor.suggestedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {mentor.suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              className="text-xs px-3 py-1.5 rounded-full bg-beige text-accent border border-accent/20 hover:bg-sand transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 用量计数显示 */}
      {initialized && session?.user && (
        <div className="flex items-center justify-center gap-1.5 mb-2 text-xs text-muted">
          {mentor.id === 'ai-guide' ? (
            <span>
              今日已用 <span className="font-medium text-brand-600">{usageUsed}</span>
              {' / '}
              <span className="font-medium">{usageLimit}</span> 次
            </span>
          ) : usageLimit !== null ? (
            <span>
              导师分身对话已用 <span className="font-medium text-accent">{usageUsed}</span>
              {' / '}
              <span className="font-medium text-accent">{usageLimit}</span> 次
            </span>
          ) : (
            <span className="text-success font-medium">
              无限次对话
            </span>
          )}
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t border-rule pt-3 safe-bottom">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              dailyLimitReached
                ? '今日消息已达上限...'
                : (usageLimit !== null && usageUsed >= usageLimit)
                  ? '免费次数用完，成为会员可继续交谈。'
                  : `问问 ${mentor.name}...`
            }
            rows={1}
            maxLength={4000}
            disabled={loading || dailyLimitReached}
            className="input-field flex-1 resize-none max-h-32 w-full"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading || dailyLimitReached}
            className="btn-primary !py-2.5 !px-4 flex-shrink-0"
          >
            {loading ? (
              <svg
                className="animate-spin"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  opacity="0.25"
                />
                <path
                  d="M12 2a10 10 0 0110 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
