'use client';

/** 导师主页访问上报（无 UI）：来源按 document.referrer 判定 card_click/search/direct */
import { useEffect } from 'react';
import { track } from '@/lib/analytics/tracker';

export function MentorProfileTracker({ mentorId }: { mentorId: string }) {
  useEffect(() => {
    let from: 'card_click' | 'direct' | 'search' = 'direct';
    try {
      const ref = document.referrer ? new URL(document.referrer).pathname : '';
      if (ref.startsWith('/mentors')) from = 'card_click';
      else if (ref.startsWith('/search')) from = 'search';
    } catch {
      from = 'direct';
    }
    track('mentor_profile.view', { props: { mentorId, from } });
  }, [mentorId]);

  return null;
}
