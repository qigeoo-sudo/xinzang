#!/bin/bash
cd /opt/xinzang
echo "===== fad3697 中真正的语义改动（忽略整文件重写） ====="
git show fad3697 | grep -n "追问" | head -20
echo "----- 语义改动前后文 -----"
git show fad3697 -U2 | grep -v "^-.*\r" | grep -A4 -B4 "上一轮已追问" | head -40
