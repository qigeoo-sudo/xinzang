'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { type Mentor } from '@/lib/mentors';
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

// 导师分身开场白池：每句都覆盖四个重点——
// 1) 表明分身身份 2) 只聊职业相关 3) 回答混合导师真实经验+大模型知识 4) 提问越清晰分析越到位
// 句式各不相同；同时遵守导师 prompt 禁用句约束（不出现“咱们不绕/几句话把事情说透/我把它拆给你看”等空转句）
const MENTOR_GREETINGS: string[] = [
  '你好，我是{name}的分身。职业上遇到的各种问题都可以聊。我的回答会结合{name}的真实经验和大模型的知识与技能；你把情况和问题说得越清楚，我的分析就越到位。',
  '嗨，我是{name}的AI分身，不是本人哦。行业、求职、职业发展上的问题都可以问我——回答里既有{name}沉淀的真实经验，也有大模型补充的通用知识。一个小建议：背景交代得越具体，我的分析就越能说到关键处。',
  '你好呀，我是{name}的分身。我只聊职业相关的事：择业、求职、转行、成长都算。我的回答是「{name}的实战经验 + 大模型知识」的组合；为了让交流更高效，提问时尽量把你的处境和困惑讲清楚。',
  '见到你很高兴，我是{name}的分身。关于职业，你现在最想解决什么问题？{name}多年积累的经验，加上大模型的知识储备，会一起为你所用；问题描述得越清晰，我给出的判断就越有针对性。',
  '你好，{name}的分身上线了。职业上的难题都可以抛过来，无关话题我可不接。每一条回答，都可能融合{name}的亲身经验和大模型的通用知识——你问得越明白，我越能答到点上。',
  '嗨，我是{name}的分身。不管你在求职路口、转行当口，还是碰到了职业困惑，都可以直接问。我的答案来自两部分：{name}的真实经验，以及大模型的知识能力；把情况说得越具体，问答的效率就越高。',
  '你好，我是{name}的分身，你可以把我当成一个带着{name}经验的AI职业顾问。职业相关的问题尽管提。需要先说明：我的回答混合了{name}的授权经验与大模型的知识技能，所以提问越聚焦、背景越清楚，分析就越到位。',
  '我是{name}的分身，专门陪你聊职业上的事。回答时我会用上{name}的真实经验，也会调用大模型的知识与技能；而问答质量很大程度取决于问题清不清晰。那么，你遇到的具体情况是什么？',
];

function pickMentorGreeting(name: string): string {
  const tpl = MENTOR_GREETINGS[Math.floor(Math.random() * MENTOR_GREETINGS.length)];
  return tpl.replaceAll('{name}', name);
}

// localStorage 键名 — 按用户+导师区分，确保对话记录隔离
const getStorageKey = (userId: string, mentorId: string, type: string) => `chat-${type}-${userId}-${mentorId}`;

// 单个用量池：标签 已用 / 额度
function UsageFrac({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <span>
      {label} <span className="font-medium text-accent">{used}</span>
      {' / '}
      <span className="font-medium text-accent">{limit}</span>
    </span>
  );
}

export function MentorChat({ mentor }: MentorChatProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const subHref = `/dashboard/subscription?from=${encodeURIComponent(pathname)}`;
  // 购买多榨卡直接定位到页面底部的多榨卡卡片
  const creditPackHref = `${subHref}#credit-pack`;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sendingRef = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  // 持久化输入内容到 sessionStorage（返回聊天页时恢复）
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    // session 首次可用时从 sessionStorage 恢复未发送的草稿
    if (!input) {
      const saved = sessionStorage.getItem(`chat-input-${userId}-${mentor.id}`);
      if (saved) setInput(saved);
    }
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const userId = session?.user?.id;
    if (userId && input) {
      sessionStorage.setItem(`chat-input-${userId}-${mentor.id}`, input);
    } else if (userId) {
      sessionStorage.removeItem(`chat-input-${userId}-${mentor.id}`);
    }
  }, [input, session?.user?.id, mentor.id]);
  const [needSubscription, setNeedSubscription] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [usageUsed, setUsageUsed] = useState<number>(0);
  const [usageLimit, setUsageLimit] = useState<number | null>(null);
  // 会员导师分身：24 小时滚动窗口内已用/上限（仅会员有值）
  const [usageDailyUsed, setUsageDailyUsed] = useState<number | null>(null);
  const [usageDailyLimit, setUsageDailyLimit] = useState<number | null>(null);
  // 多榨卡：余额 / 已用 / 累计购买（独立第三池，分子永不超过分母）
  const [usageCredits, setUsageCredits] = useState(0); // 余额
  const [usageCreditsUsed, setUsageCreditsUsed] = useState(0);
  const [usageCreditsTotal, setUsageCreditsTotal] = useState(0);

  // 从服务端重新拉取用量（冷回复不计费后用于核对，保证数字与后端口径一致）
  const refreshUsage = useCallback(() => {
    fetch('/api/chat/usage')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mentor) {
          setUsageUsed(data.mentor.used ?? 0);
          setUsageLimit(data.mentor.limit ?? null);
          setUsageDailyUsed(data.mentor.dailyUsed ?? null);
          setUsageDailyLimit(data.mentor.dailyLimit ?? null);
          setUsageCredits(data.mentor.creditsBalance ?? 0);
          setUsageCreditsUsed(data.mentor.creditsUsed ?? 0);
          setUsageCreditsTotal(data.mentor.creditsTotal ?? 0);
        }
      })
      .catch(() => {});
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初始化：读取用量 + 支持导师对话断点续传
  useEffect(() => {
    if (initialized) return;
    if (status === 'loading') return;

    // 未登录时不加载 localStorage — 确保对话记录隔离
    if (status === 'unauthenticated' || !session?.user?.id) {
      setInitialized(true);
      return;
    }

    // 获取当前用量数据
    refreshUsage();

    const userId = session.user.id;
    const msgKey = getStorageKey(userId, mentor.id, 'messages');
    const sidKey = getStorageKey(userId, mentor.id, 'session-id');

    try {
      const savedMessages = localStorage.getItem(msgKey);
      const savedSessionId = localStorage.getItem(sidKey);

      // 有保存的消息 — 从 localStorage 恢复
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages) as ChatMessage[];
        if (parsed.length > 0) {
          setMessages(parsed);
          if (savedSessionId) {
            setSessionId(savedSessionId);
          }
          setInitialized(true);
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
  const loadFromDatabase = async () => {
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
            localStorage.setItem(getStorageKey(userId, mentor.id, 'messages'), JSON.stringify(dbMessages));
            localStorage.setItem(getStorageKey(userId, mentor.id, 'session-id'), data.session.id);
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
  useEffect(() => {
    if (!initialized) return;
    // 已有消息（从 localStorage 或数据库恢复）— 不显示欢迎语
    if (messages.length > 0) return;

    setMessages([
      {
        role: 'assistant',
        content: pickMentorGreeting(mentor.name),
      },
    ]);
  }, [mentor.id, mentor.name, initialized, messages.length]);

  // 保存消息到 localStorage — 按用户+导师隔离
  const saveMessages = (msgs: ChatMessage[], sid: string | null) => {
    if (!session?.user?.id) return;
    try {
      const userId = session.user.id;
      localStorage.setItem(getStorageKey(userId, mentor.id, 'messages'), JSON.stringify(msgs));
      if (sid) {
        localStorage.setItem(getStorageKey(userId, mentor.id, 'session-id'), sid);
      }
    } catch {
      // localStorage 不可用时静默失败
    }
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading || sendingRef.current) return;
    sendingRef.current = true;

    // 未登录提示
    if (status === 'unauthenticated') {
      setShowAuthPrompt(true);
      return;
    }

    if (status === 'loading') return;

    setError('');
    setInput('');
    const uid = session?.user?.id;
    if (uid) sessionStorage.removeItem(`chat-input-${uid}-${mentor.id}`);
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
      // 客户端只发送当前消息，服务端从数据库构建对话历史，防止伪造
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
            if (session?.user?.id) {
              try {
                const userId = session.user.id;
                localStorage.removeItem(getStorageKey(userId, mentor.id, 'messages'));
                localStorage.removeItem(getStorageKey(userId, mentor.id, 'session-id'));
              } catch { /* ignore */ }
            }
            // 跳转到登录页
            router.push(`/login?callbackUrl=${pathname}`);
            return;
          }
          setShowAuthPrompt(true);
          setMessages(messages);
          setInput(messageText);
          return;
        }
        if (data.needUpgrade) {
          setNeedSubscription(true);
        } else if (data.needSubscription) {
          setNeedSubscription(true);
        } else if (data.quotaExceeded) {
          setError(data.error || '导师分身对话次数已用完');
          setNeedSubscription(true);
        } else if (data.dailyQuotaExceeded) {
          setError(data.error || '今日导师分身对话已达上限，请明天再聊');
          if (data.mentorUsed !== undefined) {
            setUsageUsed(data.mentorUsed);
            setUsageLimit(data.mentorLimit ?? null);
          }
          if (data.mentorDailyUsed !== undefined) {
            setUsageDailyUsed(data.mentorDailyUsed);
            setUsageDailyLimit(data.mentorDailyLimit ?? null);
          }
        } else {
          setError(data.error || '发送失败');
        }
        // 移除已添加的用户消息
        setMessages(messages);
        setInput(messageText);
        return;
      }

      // 添加 AI 回复
      const finalMessages = [...newMessages, { role: 'assistant' as const, content: data.reply }];
      setMessages(finalMessages);

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
      }

      // 冷回复（系统边界拦截）不计费：只在当前视图显示，不写入本地缓存，
      // 用量数字完全以服务端重拉为准，避免本地误 +1
      if (data.billed === false) {
        try {
          if (session?.user?.id && data.sessionId) {
            localStorage.setItem(
              getStorageKey(session.user.id, mentor.id, 'session-id'),
              data.sessionId,
            );
          }
        } catch { /* ignore */ }
        refreshUsage();
      } else {
        // 保存到 localStorage
        saveMessages(finalMessages, data.sessionId || sessionId);

        // 更新用量计数（响应已按统一口径返回）
        if (data.mentorUsed !== undefined) {
          setUsageUsed(data.mentorUsed);
          setUsageLimit(data.mentorLimit ?? null);
          if (data.mentorDailyUsed !== undefined) {
            setUsageDailyUsed(data.mentorDailyUsed);
            setUsageDailyLimit(data.mentorDailyLimit ?? null);
          }
        }
        if (data.creditsBalance !== undefined) {
          setUsageCredits(data.creditsBalance);
        }
        if (data.creditsUsed !== undefined) setUsageCreditsUsed(data.creditsUsed);
        if (data.creditsTotal !== undefined) setUsageCreditsTotal(data.creditsTotal);
      }
    } catch {
      setError('网络错误，请稍后再试');
      setMessages(messages);
      setInput(messageText);
    } finally {
      sendingRef.current = false;
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

  // 等待初始化
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
              <CollapsibleText content={msg.content} isUser={msg.role === 'user'} />
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
              href={subHref}
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

      {/* 用量计数显示：周期 / 每日 / 多榨卡 三个独立池子，分子永不超过各自分母 */}
      {initialized && session?.user && (
        <div className="flex items-center justify-center gap-1.5 mb-2 text-xs text-muted">
          {usageLimit !== null ? (
            <span className="flex items-center gap-2 flex-wrap justify-center">
              <UsageFrac
                label={usageDailyLimit !== null ? '本期' : '免费试用'}
                used={usageUsed}
                limit={usageLimit}
              />
              {usageDailyLimit !== null && usageDailyUsed !== null && (
                <>
                  <span className="text-slate-300">·</span>
                  <UsageFrac label="今日" used={usageDailyUsed} limit={usageDailyLimit} />
                </>
              )}
              {usageCreditsTotal > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <UsageFrac label="多榨卡" used={usageCreditsUsed} limit={usageCreditsTotal} />
                </>
              )}
            </span>
          ) : (
            <span className="text-success font-medium">无限次对话</span>
          )}
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t border-rule pt-3 safe-bottom">
        {/* 次数用完 — 总轮次或今日轮次触顶且无多榨卡余额时，引导开通会员/多榨卡 */}
        {usageLimit !== null && usageCredits === 0 && (
          usageUsed >= usageLimit ||
          (usageDailyLimit !== null && usageDailyUsed !== null && usageDailyUsed >= usageDailyLimit)
        ) && (
          <div className="flex items-center justify-center gap-1 mb-2 text-xs text-slate-600 flex-wrap">
            次数用完，开通
            <Link
              href={subHref}
              className="text-accent font-semibold underline underline-offset-2 hover:text-accent-dark"
            >
              会员
            </Link>
            或
            <Link
              href={creditPackHref}
              className="text-accent font-semibold underline underline-offset-2 hover:text-accent-dark"
            >
              购买多榨卡
            </Link>
            可继续交谈
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`告诉 ${mentor.name}...`}
            rows={1}
            maxLength={4000}
            disabled={loading}
            className="input-field flex-1 resize-none max-h-32 w-full"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
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
