#!/bin/bash
echo "===== Docker 占用 ====="
docker system df
echo "===== /opt 各目录 ====="
du -sh /opt/* 2>/dev/null | sort -rh | head -10
echo "===== docker data 子目录 ====="
du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -6
echo "====> 镜像列表 ====="
docker images
