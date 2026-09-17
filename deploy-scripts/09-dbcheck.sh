#!/bin/bash
docker run --rm -v /opt/xinzang-data:/data -v /opt/xinzang-backups:/bak xinzang-builder sh -c '
cd /app
cat > /tmp/check.mts <<"TS"
import { PrismaClient } from "/app/src/generated/prisma/index.js";
async function count(url, label) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  const [users, profiles, cards, orders, sessions, msgs] = await Promise.all([
    p.user.count(),
    p.userProfile.count(),
    p.mentorKnowledgeCard.count(),
    p.paymentOrder.count(),
    p.chatSession.count(),
    p.chatMessage.count(),
  ]);
  console.log(`${label}: users=${users} profiles=${profiles} cards=${cards} orders=${orders} chatSessions=${sessions} chatMsgs=${msgs}`);
  await p.$disconnect();
}
await count("file:/data/prod.db", "当前生产库  ");
await count("file:/bak/prod.db.20260916_031607", "备份(部署前)");
TS
DATABASE_URL="file:/data/prod.db" npx tsx /tmp/check.mts
'
