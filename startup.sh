#!/bin/bash
# 容器启动脚本
# 构建阶段已完成 db push + 知识卡 seed，启动时直接运行 Next.js
# （CloudBase 无持久卷，每次部署都是全新镜像，无需启动时重复 seed）

set -e

echo "[startup] 启动 Next.js 服务..."
cd /app
node server.js
