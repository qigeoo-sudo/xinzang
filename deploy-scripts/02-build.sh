#!/bin/bash
set -e
REL=/opt/xinzang-release
PROXY=https://gh-proxy.com/https://github.com/qigeoo-sudo/xinzang

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

echo "===== 构建 builder 镜像（用于数据库迁移） ====="
docker build --target builder -t xinzang-builder .

echo "===== 构建 runner 镜像（生产运行） ====="
docker build -t xinzang-new .

echo "BUILD_OK"
docker images | grep -E "xinzang" | head -5
