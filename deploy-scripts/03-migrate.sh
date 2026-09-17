#!/bin/bash
set -e

echo "===== prisma db push（加新列删旧列） ====="
docker run --rm -v /opt/xinzang-data:/app/data xinzang-builder sh -c "cd /app && DATABASE_URL='file:/app/data/prod.db' npx prisma db push --skip-generate --accept-data-loss"

echo "===== seed 339 张规范卡（含孤儿清理） ====="
docker run --rm -v /opt/xinzang-data:/app/data xinzang-builder sh -c "cd /app && DATABASE_URL='file:/app/data/prod.db' npx tsx prisma/seed-knowledge-cards.ts"

echo "MIGRATE_OK"
