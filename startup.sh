#!/bin/bash
# 容器启动脚本
# 1. 执行 prisma db push 确保 schema 与数据库同步
# 2. 执行知识卡 seed（幂等，重复运行安全）
# 3. 启动 Next.js 生产服务

set -e

echo "[startup] 开始启动流程..."

# 确保数据目录存在
mkdir -p /app/data

# Step 1: 同步数据库 schema
echo "[startup] 执行 prisma db push..."
cd /app
npx prisma db push --skip-generate

# Step 2: Seed 知识卡（幂等）
echo "[startup] 执行知识卡 seed..."
cd /app
npx tsx prisma/seed-mentor-kb.ts

# Step 3: 启动 Next.js
echo "[startup] 启动 Next.js 服务..."
cd /app
node server.js
