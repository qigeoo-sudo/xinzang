import { NextResponse } from 'next/server';
import { searchMentors } from '@/lib/search';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (!q) return NextResponse.json({ hits: [] });
  const hits = await searchMentors(q);
  return NextResponse.json({
    hits: hits.map((h) => ({
      id: h.mentor.id,
      name: h.mentor.name,
      title: h.mentor.title,
      avatar: h.mentor.avatar,
      tagline: h.mentor.tagline,
    })),
  });
}
