#!/usr/bin/env bash
# 从备份归档恢复监控栈数据
# 用法: ./restore.sh <backup.tar.gz>
# 流程: 停掉整个监控栈 -> 覆盖 data/ -> 重启
set -euo pipefail

if [ $# -lt 1 ] || [ ! -f "$1" ]; then
   echo "用法: $0 <backup.tar.gz>"
   exit 1
fi

ARCHIVE="$(readlink -f "$1")"
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$PKG_DIR/deploy"

read -rp "将用 $ARCHIVE 覆盖 $DEPLOY_DIR/data，监控栈会短暂停机，继续? [y/N] " confirm
if [ "${confirm,,}" != "y" ]; then
   echo "已取消"
   exit 0
fi

cd "$DEPLOY_DIR"

echo "==> 停止监控栈..."
docker compose down

echo "==> 清空并恢复 data/..."
rm -rf "$DEPLOY_DIR/data"
tar xzf "$ARCHIVE" -C "$DEPLOY_DIR"

echo "==> 修正目录属主..."
bash "$PKG_DIR/scripts/init-data-dirs.sh"

echo "==> 启动监控栈..."
docker compose up -d

echo "==> 恢复完成，访问 http://127.0.0.1:13000 验证"
