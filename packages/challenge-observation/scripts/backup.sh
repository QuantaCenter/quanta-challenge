#!/usr/bin/env bash
# 备份监控栈全部本地数据（Prometheus TSDB / Loki / Grafana SQLite / observation SQLite / Alloy 状态）
# 用法: ./backup.sh [输出目录]   （默认 packages/challenge-observation/backups）
# 流程: 短暂停止有状态服务 -> tar 打包 data/ -> 重启，全程约几秒
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$PKG_DIR/deploy"
BACKUP_DIR="${1:-$PKG_DIR/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_DIR/observation-backup-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

cd "$DEPLOY_DIR"

echo "==> 停止有状态服务 (prometheus/loki/grafana/observation)..."
docker compose stop prometheus loki grafana observation

echo "==> 打包 $DEPLOY_DIR/data -> $ARCHIVE"
tar czf "$ARCHIVE" -C "$DEPLOY_DIR" data

echo "==> 重启服务..."
docker compose up -d prometheus loki grafana observation

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
echo "==> 备份完成: $ARCHIVE ($SIZE)"
echo "    提示: 定期清理旧备份，例如只保留最近 7 份："
echo "    ls -t $BACKUP_DIR/observation-backup-*.tar.gz | tail -n +8 | xargs -r rm -f"
