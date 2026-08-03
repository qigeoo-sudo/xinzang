import type { ChatMessage } from "./types";

export interface ChatSession {
  id: string;
  mentorId: string; // "general" for AI guider, or mentor.id
  mentorName: string;
  mentorAvatar?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  title: string; // First user message or auto-generated
}

const SESSIONS_KEY = "chat_sessions_list";

/** Generate a unique session ID */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/** Get all chat sessions (metadata only, without full messages) */
export function getAllSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw) as ChatSession[];
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

/** Save a session to history (creates or updates) */
export function saveSession(session: Omit<ChatSession, "id" | "createdAt" | "updatedAt" | "title"> & {
  id?: string;
  title?: string;
  lang?: "zh" | "en";
}): ChatSession {
  const sessions = getAllSessions();
  const now = new Date().toISOString();

  // Generate title from first user message
  const firstUserMsg = session.messages.find((m) => m.role === "user");
  const defaultTitle = session.lang === "en" ? "New Chat" : "新对话";
  const title = session.title || (firstUserMsg ? firstUserMsg.content.slice(0, 40) : defaultTitle);

  if (session.id) {
    // Update existing
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      const updated: ChatSession = {
        ...sessions[idx],
        ...session,
        id: session.id,
        title,
        updatedAt: now,
        messages: session.messages,
      };
      sessions[idx] = updated;
      persistSessions(sessions);
      return updated;
    }
  }

  // Create new
  const newSession: ChatSession = {
    id: generateSessionId(),
    mentorId: session.mentorId,
    mentorName: session.mentorName,
    mentorAvatar: session.mentorAvatar,
    messages: session.messages,
    createdAt: now,
    updatedAt: now,
    title,
  };
  sessions.unshift(newSession);
  persistSessions(sessions);
  return newSession;
}

/** Get a single session by ID (with full messages) */
export function getSessionById(id: string): ChatSession | null {
  const sessions = getAllSessions();
  return sessions.find((s) => s.id === id) || null;
}

/** Delete a session by ID */
export function deleteSession(id: string): void {
  const sessions = getAllSessions();
  const filtered = sessions.filter((s) => s.id !== id);
  persistSessions(filtered);
}

/** Get sessions for a specific mentor */
export function getSessionsByMentor(mentorId: string): ChatSession[] {
  return getAllSessions().filter((s) => s.mentorId === mentorId);
}

/** Get total chat count */
export function getChatCount(): number {
  return getAllSessions().length;
}

/** Sort sessions by time (newest first by default) */
export function sortSessionsByTime(sessions: ChatSession[], descending = true): ChatSession[] {
  return [...sessions].sort((a, b) => {
    const cmp = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return descending ? cmp : -cmp;
  });
}

/** Sort sessions by mentor name (AI guider first, then alphabetical) */
export function sortSessionsByMentor(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => {
    // AI guider always first
    if (a.mentorId === "general" && b.mentorId !== "general") return -1;
    if (a.mentorId !== "general" && b.mentorId === "general") return 1;
    // Then by mentor name
    const nameCmp = a.mentorName.localeCompare(b.mentorName);
    if (nameCmp !== 0) return nameCmp;
    // Same mentor, sort by time descending
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function persistSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // ignore storage errors
  }
}

/** Format relative time */
export function formatRelativeTime(iso: string, lang: "zh" | "en"): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === "zh") {
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN");
  } else {
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-US");
  }
}
