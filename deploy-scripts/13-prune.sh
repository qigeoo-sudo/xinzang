#!/bin/bash
echo "===== 清理前 ====="
df -h / | tail -1
echo "===== 删除悬空镜像（dangling，无标签、无容器使用） ====="
docker image prune -f
echo "===== 清理后 ====="
df -h / | tail -1
docker system df
