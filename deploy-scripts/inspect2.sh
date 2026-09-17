#!/bin/bash
cd /opt/xinzang
echo "===== fad3697 改动内容 ====="
git show fad3697 --format='%h %s' -U3 | head -80
echo "===== 当前远端 prompts.ts 是否已含同样逻辑 ====="
grep -n "已追问" src/lib/prompts.ts | head -10
