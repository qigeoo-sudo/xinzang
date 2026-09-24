#!/bin/bash
set -e

echo "===== prisma db push（MySQL，在服务器直接执行） ====="
cd /opt/xinzang
npx prisma generate
npx prisma db push --skip-generate --accept-data-loss

echo "===== seed 知识卡（340 张，含孤儿清理） ====="
npx tsx prisma/seed-knowledge-cards.ts

echo "MIGRATE_OK"
