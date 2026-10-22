#!/usr/bin/env bash
# 备份网关数据目录（账号、历史、模型配置、用量、审计、反馈等）为带时间戳的 tar.gz，只保留最近 N 份。
# 用法（在服务器项目目录里）：bash scripts/backup-data.sh [数据目录=./data] [备份目录=./backups] [保留份数=14]
# 建议加到 crontab：  0 3 * * *  cd /path/to/project && bash scripts/backup-data.sh
# 备份里含密钥与密码哈希（auth-secret.key、providers.json），请只放在服务器本机或受控存储，不要提交到 Git。
set -euo pipefail
DATA_DIR="${1:-./data}"
BACKUP_DIR="${2:-./backups}"
KEEP="${3:-14}"
[ -d "$DATA_DIR" ] || { echo "数据目录不存在：$DATA_DIR" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/gateway-data-$STAMP.tar.gz"
tar -czf "$OUT" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
chmod 600 "$OUT"
ls -1t "$BACKUP_DIR"/gateway-data-*.tar.gz | tail -n +$((KEEP + 1)) | while IFS= read -r old; do rm -f -- "$old"; done
echo "已备份：$OUT"
