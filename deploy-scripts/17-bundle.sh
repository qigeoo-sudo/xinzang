#!/bin/bash
echo "===== 运行镜像中的完成页硬跳转 ====="
docker exec xinzang sh -c "grep -rl 'register-wizard' /app/.next/static/chunks 2>/dev/null | head -3; grep -rlo 'window.location.href=\"/dashboard/profile\"' /app/.next/static/chunks 2>/dev/null | head -5"
echo "===== 发布代码版本 ====="
cd /opt/xinzang-release && git log -1 --format='%h %s'
echo "===== 镜像构建时间 ====="
docker images xinzang-new --format '{{.CreatedAt}}'
