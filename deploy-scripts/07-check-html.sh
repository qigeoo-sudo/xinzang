#!/bin/bash
r=$(curl -s https://aihr.top/)
echo "HTML size: $(echo -n "$r" | wc -c)"
echo "===== 含 mentors 的片段 ====="
echo "$r" | grep -oE 'href="[^"]*mentor[^"]*"' | sort -u | head -20
echo "===== 导师英文名/中文名片段 ====="
for kw in Freya freya Phyllis phyllis Ying ying Lydia Winnie Tina 高 叶 尹; do
  c=$(echo "$r" | grep -c "$kw")
  echo "$kw : $c"
done
echo "===== title ====="
echo "$r" | grep -oE '<title>[^<]*</title>'
