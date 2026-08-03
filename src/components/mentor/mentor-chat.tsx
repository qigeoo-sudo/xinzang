"use client";

import { ChatInterface } from "@/components/chat/chat-interface";
import { useI18n } from "@/lib/i18n";

interface MentorChatProps {
  mentorId: string;
  mentorName: string;
  mentorPersonality: string;
  mentorAvatar?: string;
  sessionId?: string;
  readOnly?: boolean;
}

export function MentorChat({ mentorId, mentorName, mentorPersonality, mentorAvatar, sessionId, readOnly }: MentorChatProps) {
  const { trFmt } = useI18n();
  return (
    <ChatInterface
      mentorId={mentorId}
      mentorName={mentorName}
      mentorPersonality={mentorPersonality}
      mentorAvatar={mentorAvatar}
      sessionId={sessionId}
      readOnly={readOnly}
      placeholder={trFmt(
        { zh: "问问 {name} 关于行业的问题...", en: "Ask {name} about the industry..." },
        { name: mentorName }
      )}
    />
  );
}
