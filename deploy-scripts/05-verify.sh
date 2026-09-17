#!/bin/bash
sleep 3
echo "===== 容器日志（最后30行） ====="
docker logs xinzang --tail 30 2>&1
echo "===== 本地 HTTP 检查 ====="
curl -s -o /dev/null -w "localhost:3000 -> %{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/ | grep -o "AI Career Companion" | head -1 || true
