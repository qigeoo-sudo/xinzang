export interface Mentor {
  id: string;
  name: string;
  avatar: string;
  industry: string;
  role: string;
  company_type: string;
  years: number;
  tagline: string;
  personality_prompt: string;
  knowledge: KnowledgeEntry[];
  available: boolean;
  price: number;
  tags: string[];
  featured?: boolean;
}

export interface KnowledgeEntry {
  category: string;
  content: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface UserProfile {
  name: string;
  education: string;
  major: string;
  interests: string[];
  skills: string[];
  goals: string;
}
