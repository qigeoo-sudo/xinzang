#!/bin/bash
set -e
# Dockerfile 使用了 BuildKit 缓存挂载（--mount=type=cache），必须显式启用
export DOCKER_BUILDKIT=1
REL=/opt/xinzang-release
PROXY=https://gh-proxy.com/https://github.com/qigeoo-sudo/xinzang

echo "===== 清理旧镜像（build 前执行，释放磁盘空间） ====="
docker image prune -f
df -h / | tail -1

echo "===== 准备发布目录（全新 clone，不碰 /opt/xinzang） ====="
if [ -d "$REL/.git" ]; then
  cd $REL
  git fetch origin master
  git checkout -B master origin/master
else
  git clone -b master $PROXY $REL
  cd $REL
fi
git log -1 --format='release at %h %s'

echo "===== 构建 runner 镜像（生产运行） ====="
docker build -t xinzang-new .

echo "BUILD_OK"
docker images | grep -E "xinzang" | head -5
