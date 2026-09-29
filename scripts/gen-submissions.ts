/**
 * 重新生成 submissions.json + profile.json — 匹配组件结构
 * npx tsx scripts/gen-submissions.ts
 */
import { prisma } from '../src/lib/prisma';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const MENTOR_ID = 'lydiachen';

const DOMAINS = ['职业规划', '简历优化', '面试技巧', '职场人际', '转行转型', 'offer选择', '实习转正', '职场晋升'];
const STATUSES = ['PUBLISHED', 'PUBLISHED', 'PUBLISHED', 'APPROVED', 'PENDING', 'PUBLISHED'];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function main() {
  const outDir = join(process.cwd(), 'public', 'demo');
  mkdirSync(outDir, { recursive: true });

  // === Profile ===
  const profile = {
    mentorName: 'Lydia Chen',
    tags: ['资深HR', '职业规划', '面试辅导', '跨行业转型'],
    intro: '10年+人力资源管理经验，曾在多家500强企业担任HR总监。擅长帮助求职者梳理职业方向、优化简历、模拟面试。专注于帮助应届毕业生和初职场人找到适合自己的职业路径。',
    avatar: '',
  };
  writeFileSync(join(outDir, 'profile.json'), JSON.stringify(profile, null, 2));
  console.log('profile.json saved');

  // === Submissions ===
  const cards = await prisma.mentorKnowledgeCard.findMany({
    where: { mentorId: MENTOR_ID },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const submissions = cards.map((c, i) => {
    const status = rand(STATUSES);
    const isCase = !!c.caseText;
    const submittedAt = c.createdAt.toISOString();
    const publishedAt = status === 'PUBLISHED' ? submittedAt : null;

    return {
      id: c.cardId,
      submissionType: isCase ? 'CONTENT_SUPPLEMENT' : 'CONTENT_SUPPLEMENT',
      fieldLabel: c.domain,
      afterValue: c.title,
      status,
      reviewNote: status === 'REJECTED' ? '内容需补充具体案例' : status === 'PENDING' ? null : null,
      submittedAt,
      publishedAt,
    };
  });

  const result = { submissions };
  writeFileSync(join(outDir, 'submissions.json'), JSON.stringify(result, null, 2));
  console.log('submissions.json saved — count:', submissions.length);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
