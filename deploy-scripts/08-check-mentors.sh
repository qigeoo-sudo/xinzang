#!/bin/bash
echo "===== /mentors ====="
curl -s -o /dev/null -w "%{http_code}\n" https://aihr.top/mentors
r=$(curl -s https://aihr.top/mentors)
echo "HTML size: $(echo -n "$r" | wc -c)"
echo "$r" | grep -oE 'href="/mentors/[a-z]+"' | sort -u
echo "===== 各导师详情页状态码 ====="
for m in freya lydia phyllis tina winnie ying; do
  code=$(curl -s -o /dev/null -w "%{http_code}" https://aihr.top/mentors/$m)
  echo "/mentors/$m -> $code"
done
