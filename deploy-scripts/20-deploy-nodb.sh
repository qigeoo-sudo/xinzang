#!/bin/bash
set -e

echo "===== 磁盘检查 ====="
df -h / | tail -1

echo "===== 拉取最新代码 ====="
REL=/opt/xinzang-release
cd $REL
git fetch origin master
git checkout -B master origin/master
git log -1 --format='release at %h %s'

echo "===== 构建生产镜像 ====="
docker build -t xinzang-new .
echo "BUILD_OK"
docker images | grep -E "xinzang" | head -5

echo "===== 换容器 ====="
docker rm -f xinzang
docker run -d --name xinzang --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p 3000:3000 \
  -v /opt/xinzang-data:/app/data \
  --env-file /opt/xinzang/.env \
  xinzang-new

sleep 5
docker ps --filter name=xinzang
echo "===== 磁盘检查（部署后） ====="
df -h / | tail -1
echo "DEPLOY_DONE"
