"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, User, RotateCcw, ExternalLink, History } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { saveSession, getSessionById } from "@/lib/chat-history";

// Parse markdown links [text](url) and render as clickable links
function renderContent(content: string, isUser: boolean) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const [, text, url] = match;
    const isInternal = url.startsWith("/");
    if (isInternal) {
      parts.push(
        <Link
          key={key++}
          href={url}
          className={cn(
            "inline-flex items-center gap-0.5 font-medium underline-offset-2 hover:underline",
            isUser ? "text-blue-100 hover:text-white" : "text-brand-600 hover:text-brand-700"
          )}
        >
          {text}
        </Link>
      );
    } else {
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-0.5 font-medium underline-offset-2 hover:underline",
            isUser ? "text-blue-100 hover:text-white" : "text-brand-600 hover:text-brand-700"
          )}
        >
          {text}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts;
}

interface ChatInterfaceProps {
  mentorId?: string;
  mentorName?: string;
  mentorPersonality?: string;
  mentorAvatar?: string;
  placeholder?: string;
  /** Load a specific historical session */
  sessionId?: string;
  /** Read-only mode for viewing history */
  readOnly?: boolean;
}

export function ChatInterface({
  mentorId,
  mentorName,
  mentorPersonality,
  mentorAvatar,
  placeholder,
  sessionId,
  readOnly = false,
}: ChatInterfaceProps) {
  const { tr, trFmt, lang } = useI18n();
  const effectiveMentorId = mentorId || "general";
  const effectiveMentorName = mentorName || tr({ zh: "AI 职业导师", en: "AI Career Mentor" });

  // Active session storage key (for auto-save of current active conversation)
  const activeKey = `chat_active_${effectiveMentorId}`;

  // Welcome message based on language and mentor type
  const getWelcomeMessage = useCallback((): ChatMessage => {
    return {
      role: "assistant",
      content: mentorId
        ? trFmt(
            { zh: "你好！我是{name}。你可以问我关于行业、求职、职业发展的任何问题，我会用我真实的经验来回答你。", en: "Hello! I'm {name}. You can ask me anything about the industry, job hunting, or career development. I'll answer with my real experience." },
            { name: effectiveMentorName }
          )
        : tr({
            zh: "你好！我是你的 AI 职业导师。\n\n我不会直接给你答案——我的方式是通过提问帮你理清自己的状态和需求。当你需要具体行业洞察时，我会帮你找到对的人。\n\n你现在的状态是什么？在校探索、准备求职、还是刚入职场？",
            en: "Hello! I'm your AI Career Mentor.\n\nI won't give you direct answers — my approach is to help you clarify your situation and needs through questions. When you need specific industry insights, I'll help you find the right person.\n\nWhat's your current situation? Still exploring in school, preparing for job hunting, or just started your career?",
          }),
    };
  }, [mentorId, effectiveMentorName, tr, trFmt]);

  // Initialize with welcome message (consistent for SSR)
  const [messages, setMessages] = useState<ChatMessage[]>([getWelcomeMessage()]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(sessionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages: either from history session, or from active conversation
  useEffect(() => {
    if (sessionId) {
      // Loading a historical session
      const session = getSessionById(sessionId);
      if (session && session.messages.length > 0) {
        setMessages(session.messages);
        setCurrentSessionId(sessionId);
      }
      setHydrated(true);
      return;
    }

    // Load active conversation for this mentor
    try {
      const saved = localStorage.getItem(activeKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Check if it has actual conversation (more than just welcome message)
          setMessages(parsed);
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, [activeKey, sessionId]);

  // Auto-save active conversation to localStorage
  useEffect(() => {
    if (!hydrated || readOnly) return;
    try {
      localStorage.setItem(activeKey, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, activeKey, hydrated, readOnly]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Save current conversation to history
  const saveToHistory = useCallback(() => {
    if (readOnly) return;
    // Only save if there's actual conversation (at least one user message)
    const hasUserMessage = messages.some((m) => m.role === "user");
    if (!hasUserMessage) return;

    saveSession({
      id: currentSessionId,
      mentorId: effectiveMentorId,
      mentorName: effectiveMentorName,
      mentorAvatar: mentorAvatar,
      messages,
      lang,
    });
  }, [messages, currentSessionId, effectiveMentorId, effectiveMentorName, mentorAvatar, readOnly, lang]);

  // Auto-save to history when messages change (debounced via effect)
  useEffect(() => {
    if (!hydrated || readOnly) return;
    const hasUserMessage = messages.some((m) => m.role === "user");
    if (!hasUserMessage) return;

    const timeout = setTimeout(() => {
      const session = saveSession({
        id: currentSessionId,
        mentorId: effectiveMentorId,
        mentorName: effectiveMentorName,
        mentorAvatar: mentorAvatar,
        messages,
        lang,
      });
      if (!currentSessionId) {
        setCurrentSessionId(session.id);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [messages, hydrated, readOnly, currentSessionId, effectiveMentorId, effectiveMentorName, mentorAvatar, lang]);

  // New conversation: save current, start fresh
  function handleNewChat() {
    // Save current conversation to history first
    saveToHistory();

    // Clear active conversation
    try {
      localStorage.removeItem(activeKey);
    } catch {
      // ignore
    }

    // Reset state
    setMessages([getWelcomeMessage()]);
    setCurrentSessionId(undefined);
    setInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading || readOnly) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          mentorId,
          mentorPersonality,
        }),
      });

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || tr({ zh: "抱歉，我没能理解。能换个方式说说吗？", en: "Sorry, I didn't quite understand. Could you rephrase?" }) },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: tr({ zh: "网络出了点问题，请稍后再试。", en: "Network issue, please try again later." }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // Quick questions based on language and mentor type
  const quickQuestions = mentorId
    ? [
        tr({ zh: "你面试时最看重候选人的什么特质？", en: "What traits do you value most in candidates?" }),
        tr({ zh: "对应届生有什么建议？", en: "Any advice for fresh graduates?" }),
        tr({ zh: "这个行业最大的误区是什么？", en: "What's the biggest misconception about this industry?" }),
      ]
    : [
        tr({ zh: "我喜欢AI，但不知道适合技术还是产品", en: "I like AI, but not sure if I fit tech or product roles" }),
        tr({ zh: "我是海归硕士，回国找工作该注意什么？", en: "I'm a returning master's grad, what should I know?" }),
        tr({ zh: "不确定自己适合什么方向怎么办？", en: "What if I'm not sure what direction suits me?" }),
      ];

  const hasConversation = messages.some((m) => m.role === "user");
  const effectivePlaceholder = placeholder || tr({ zh: "说说你的困惑，比如：我适合什么方向？", en: "Share your concern, e.g.: What direction suits me?" });

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)]">
      {/* Chat header */}
      <div className="border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm overflow-hidden",
                mentorId ? "bg-gradient-to-br from-sage-400 to-sage-600" : "bg-gradient-to-br from-brand-400 to-brand-600"
              )}
            >
              {mentorAvatar ? (
                <Image src={mentorAvatar} alt={effectiveMentorName} width={36} height={36} className="h-full w-full object-cover" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="font-bold text-sm text-brand-900">{effectiveMentorName}</p>
              <p className="text-xs text-slate-400">
                {mentorId
                  ? tr({ zh: "行业导师 AI 分身", en: "Industry Veteran AI" })
                  : tr({ zh: "AI 职业导师", en: "AI Career Mentor" })}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {readOnly && (
              <Link
                href={mentorId ? `/mentor/${mentorId}` : "/chat"}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-600"
                title={tr({ zh: "继续对话", en: "Resume Chat" })}
              >
                <History className="h-3.5 w-3.5" />
                <span>{tr({ zh: "继续对话", en: "Resume Chat" })}</span>
              </Link>
            )}
            {!readOnly && hasConversation && (
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-600"
                title={tr({ zh: "开始新对话", en: "Start a new conversation" })}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{tr({ zh: "新对话", en: "New Chat" })}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-3 py-4 space-y-4 bg-[#f7fafa]">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "flex gap-2.5",
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white text-xs font-bold shadow-sm overflow-hidden",
                msg.role === "user"
                  ? "bg-slate-600"
                  : mentorId
                  ? "bg-gradient-to-br from-sage-400 to-sage-600"
                  : "bg-gradient-to-br from-brand-400 to-brand-600"
              )}
            >
              {msg.role === "user" ? (
                <User className="h-4 w-4" />
              ) : mentorAvatar ? (
                <Image src={mentorAvatar} alt={effectiveMentorName} width={32} height={32} className="h-full w-full object-cover" />
              ) : (
                effectiveMentorName[0]
              )}
            </div>
            {/* Bubble */}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-brand-500 text-white rounded-tr-sm shadow-sm"
                  : "bg-white text-slate-700 border border-slate-100 rounded-tl-sm shadow-sm"
              )}
            >
              <div className="prose-chat whitespace-pre-wrap">{renderContent(msg.content, msg.role === "user")}</div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-2.5">
            <div
              className={cn(
                "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white text-xs font-bold shadow-sm overflow-hidden",
                mentorId
                  ? "bg-gradient-to-br from-sage-400 to-sage-600"
                  : "bg-gradient-to-br from-brand-400 to-brand-600"
              )}
            >
              {mentorAvatar ? (
                <Image src={mentorAvatar} alt={effectiveMentorName} width={32} height={32} className="h-full w-full object-cover" />
              ) : (
                effectiveMentorName[0]
              )}
            </div>
            <div className="flex items-center gap-1 rounded-2xl bg-white border border-slate-100 px-4 py-3 shadow-sm">
              <span className="h-2 w-2 animate-bounce rounded-full bg-brand-300 [animation-delay:-0.3s]"></span>
              <span className="h-2 w-2 animate-bounce rounded-full bg-brand-300 [animation-delay:-0.15s]"></span>
              <span className="h-2 w-2 animate-bounce rounded-full bg-brand-300"></span>
            </div>
          </div>
        )}
      </div>

      {/* Quick questions */}
      {!readOnly && messages.length <= 1 && (
        <div className="px-4 py-2 bg-white border-t border-slate-100">
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => setInput(q)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      {!readOnly && (
        <div className="border-t border-slate-200/60 bg-white/80 backdrop-blur-md p-3 pb-4 md:pb-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={effectivePlaceholder}
              disabled={isLoading}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-40"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
