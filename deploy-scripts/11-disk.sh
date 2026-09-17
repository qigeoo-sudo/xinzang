#!/bin/bash
echo "===== 磁盘/inode ====="
df -h /opt | tail -1
df -i /opt | tail -1
echo "===== 数据目录属主 ====="
ls -la /opt/xinzang-data/
