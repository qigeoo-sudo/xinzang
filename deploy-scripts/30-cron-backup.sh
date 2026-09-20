#!/bin/bash
# 每日定时冷备 SQLite（crontab 调用，建议凌晨低峰执行）
#
# 流程：停容器 → 复制 prod.db(+wal/shm) → 启容器 → 清理过期备份 → 日志自轮转
# 停机时间约 5-10 秒。容器即使复制失败也一定会被重新拉起。
#
# 迁移到火山引擎 RDS MySQL 后本脚本作废：
#   改用 RDS 自动备份/时间点恢复，并删除对应 crontab 条目。
#
# 用法：
#   30 3 * * * /opt/xinzang/cron-backup.sh >> /opt/xinzang-backups/cron.log 2>&1
#   环境变量 BACKUP_KEEP_DAYS 可调整保留天数（默认 14）

BK=/opt/xinzang-backups
DATA=/opt/xinzang-data
LOG=$BK/cron.log
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
TS=$(date +%Y%m%d_%H%M%S)
CONTAINER=xinzang

mkdir -p "$BK"

docker stop "$CONTAINER" >/dev/null 2>&1 || true
sleep 2

COPIED=0
for f in prod.db prod.db-wal prod.db-shm; do
  if [ -f "$DATA/$f" ]; then
    cp -p "$DATA/$f" "$BK/$f.$TS"
    COPIED=1
  fi
done

# 无论复制结果如何都立即拉起容器
docker start "$CONTAINER" >/dev/null 2>&1

if [ "$COPIED" = "0" ]; then
  echo "$TS BACKUP_FAILED: no db files found in $DATA"
  exit 1
fi

# 清理超过保留期的备份文件
find "$BK" -maxdepth 1 -name 'prod.db*' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "$TS BACKUP_OK keep=${KEEP_DAYS}d files=$(find "$BK" -maxdepth 1 -name "prod.db*.$TS" | wc -l)"

# cron.log 超过 5MB 时只保留最后 1000 行
if [ -f "$LOG" ]; then
  LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
  if [ "$LOG_SIZE" -gt 5242880 ]; then
    tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
fi
