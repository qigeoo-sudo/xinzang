#!/bin/bash
cd /opt/xinzang
echo "===== 本地 master 独有提交 ====="
git log --format='%h %ci %s' origin/master..master
echo "===== origin/master 独有数量 ====="
git rev-list --count master..origin/master
echo "===== merge base ====="
git merge-base master origin/master | xargs git log -1 --format='%h %ci %s'
echo "===== 未提交改动详情 ====="
git status --porcelain
echo "===== 未提交改动 mentors.ts 摘要 ====="
git diff --stat src/lib/mentors.ts src/lib/prompts.ts
