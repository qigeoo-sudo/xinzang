#!/bin/bash
echo "===== next/image 优化器（头像） ====="
curl -s -o /dev/null -w "optimizer -> %{http_code}\n" "https://aihr.top/_next/image?url=%2Favatars%2Flydia-chen.jpg&w=128&q=75"
echo "===== 原始静态头像 ====="
curl -s -o /dev/null -w "static jpg -> %{http_code}\n" "https://aihr.top/avatars/lydia-chen.jpg"
echo "===== 新导师字母头像 ====="
for a in freya-gao phyllis-chi ying-wang; do
  curl -s -o /dev/null -w "$a -> %{http_code}\n" "https://aihr.top/avatars/$a.svg"
done
