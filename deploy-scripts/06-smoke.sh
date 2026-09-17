#!/bin/bash
echo "===== 公网域名检查 ====="
curl -s -o /dev/null -w "https://aihr.top -> %{http_code}\n" https://aihr.top/
r=$(curl -s https://aihr.top/)
for m in freya phyllis ying lydia tina winnie; do
  if echo "$r" | grep -q "/mentors/$m"; then
    echo "mentor $m : present"
  else
    echo "mentor $m : MISSING"
  fi
done
