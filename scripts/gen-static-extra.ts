/**
 * 生成 audience + submissions + profile 静态 JSON
 * npx tsx scripts/gen-static-extra.ts
 */
import { prisma } from '../src/lib/prisma';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const MENTOR_ID = 'lydiachen';

async function main() {
  const outDir = join(process.cwd(), 'public', 'demo');
  mkdirSync(outDir, { recursive: true });

  // === Profile ===
  console.log('Generating profile.json...');
  const mentorUser = await prisma.user.findFirst({ where: { boundMentorId: MENTOR_ID } });
  const profile = {
    id: mentorUser?.id ?? '',
    name: mentorUser?.name ?? 'Lydia Chen',
    phone: mentorUser?.phone ?? '',
    boundMentorId: MENTOR_ID,
    createdAt: mentorUser?.createdAt?.toISOString() ?? new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'profile.json'), JSON.stringify(profile, null, 2));
  console.log('  profile.json saved');

  // === Audience ===
  console.log('Generating audience.json...');
  const sessions = await prisma.chatSession.findMany({
    where: { mentorId: MENTOR_ID },
    select: { userId: true },
  });
  const userIds = [...new Set(sessions.map(s => s.userId))];

  // User profiles + interest assessments
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: { profile: true, interestAssessment: true },
  });

  // Age buckets
  const ageBuckets: Record<string, number> = {};
  for (const u of users) {
    const bm = u.profile?.birthMonth;
    if (!bm) { ageBuckets['未知'] = (ageBuckets['未知'] ?? 0) + 1; continue; }
    const year = parseInt(bm.slice(0, 4));
    const age = 2026 - year;
    let bucket = '';
    if (age < 22) bucket = '18-21';
    else if (age < 25) bucket = '22-24';
    else if (age < 28) bucket = '25-27';
    else if (age < 31) bucket = '28-30';
    else bucket = '31+';
    ageBuckets[bucket] = (ageBuckets[bucket] ?? 0) + 1;
  }

  // Career distribution
  const careerMap: Record<string, number> = {};
  for (const u of users) {
    const careers = u.profile?.careers ? JSON.parse(u.profile.careers) : [];
    for (const c of careers) careerMap[c] = (careerMap[c] ?? 0) + 1;
  }

  // Help priority
  const helpMap: Record<string, number> = {};
  for (const u of users) {
    const help = u.profile?.helpPriority ? JSON.parse(u.profile.helpPriority) : [];
    for (const h of help) helpMap[h] = (helpMap[h] ?? 0) + 1;
  }

  // Mentor preference
  const prefMap: Record<string, number> = {};
  for (const u of users) {
    const prefs = u.profile?.mentorPreference ? JSON.parse(u.profile.mentorPreference) : [];
    for (const p of prefs) prefMap[p] = (prefMap[p] ?? 0) + 1;
  }

  // RIASEC
  const riasecMap: Record<string, number> = {};
  for (const u of users) {
    const code = u.interestAssessment?.code ?? '';
    for (const ch of code) riasecMap[ch] = (riasecMap[ch] ?? 0) + 1;
  }

  // Anxiety
  const anxietyMap: Record<string, number> = {};
  for (const u of users) {
    const a = u.profile?.careerAnxiety;
    if (a) {
      const key = a.length > 20 ? a.slice(0, 20) + '...' : a;
      anxietyMap[key] = (anxietyMap[key] ?? 0) + 1;
    }
  }

  const audience = {
    totalUsers: userIds.length,
    ageBuckets: Object.entries(ageBuckets).sort((a, b) => b[1] - a[1]),
    careers: Object.entries(careerMap).sort((a, b) => b[1] - a[1]),
    helpPriorities: Object.entries(helpMap).sort((a, b) => b[1] - a[1]),
    mentorPreferences: Object.entries(prefMap).sort((a, b) => b[1] - a[1]),
    riasecCodes: Object.entries(riasecMap).sort((a, b) => b[1] - a[1]),
    anxieties: Object.entries(anxietyMap).sort((a, b) => b[1] - a[1]),
  };
  writeFileSync(join(outDir, 'audience.json'), JSON.stringify(audience, null, 2));
  console.log('  audience.json saved');

  // === Submissions ===
  console.log('Generating submissions.json...');
  const cards = await prisma.mentorKnowledgeCard.findMany({
    where: { mentorId: MENTOR_ID },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const submissions = {
    items: cards.map(c => ({
      id: c.cardId,
      domain: c.domain,
      title: c.title,
      knowledgeClass: c.knowledgeClass,
      hasCase: !!c.caseText,
      createdAt: c.createdAt.toISOString(),
    })),
    total: cards.length,
  };
  writeFileSync(join(outDir, 'submissions.json'), JSON.stringify(submissions, null, 2));
  console.log('  submissions.json saved');

  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
