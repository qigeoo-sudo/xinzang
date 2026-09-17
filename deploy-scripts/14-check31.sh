#!/bin/bash
docker exec xinzang sh -c 'DATABASE_URL="file:/app/data/prod.db" node -e "
const { PrismaClient } = require(\"/app/src/generated/prisma/index.js\");
(async () => {
  const p = new PrismaClient();
  const u = await p.user.findUnique({ where: { phone: \"13900000031\" }, include: { profile: true } });
  console.log(\"user31:\", u ? JSON.stringify({ id: u.id, name: u.name, hasProfile: !!u.profile, completed: u.profile?.registrationCompletedAt }) : \"NOT_FOUND\");
  const c = await p.verificationCode.findFirst({ where: { identifier: \"13900000031\" }, orderBy: { createdAt: \"desc\" } });
  console.log(\"code31:\", c ? JSON.stringify({ code: c.code, usedAt: c.usedAt, attempts: c.attempts, expiresAt: c.expiresAt }) : \"NONE\");
  await p.\$disconnect();
})();
"' 2>&1 | grep -v "^prisma:"
