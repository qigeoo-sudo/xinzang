#!/bin/bash
# 火山引擎生产部署脚本 — 知识卡四分类升级
set -e
echo "===== 1. 容器状态 ====="
docker ps -a --filter name=xinzang || true

echo "===== 2. 停容器 ====="
docker stop xinzang 2>/dev/null || true
sleep 2

echo "===== 3. 备份数据库 ====="
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p /opt/xinzang-backups
for f in prod.db prod.db-wal prod.db-shm; do
  if [ -f /opt/xinzang-data/$f ]; then
    cp -p /opt/xinzang-data/$f /opt/xinzang-backups/$f.$TS
    echo "backed up: $f.$TS"
  fi
done
ls -la /opt/xinzang-backups/ | tail -6
echo "BACKUP_TS=$TS"
