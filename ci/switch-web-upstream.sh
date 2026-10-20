#!/usr/bin/env bash
# 切换 OpenResty 反代的 web-app 后端端口（蓝绿 active slot）。用法：sudo bash ci/switch-web-upstream.sh 3002
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "需要 root"; exit 1; }

PORT=${1:?用法: switch-web-upstream.sh <host-port>}
CONF=${WEB_UPSTREAM_CONF:-/www/qc-secrets/web-upstream.conf}
mkdir -p "$(dirname "$CONF")"
printf 'set $web_backend 127.0.0.1:%s;\n' "$PORT" > "$CONF"
chmod 644 "$CONF"

CID=$(docker ps -qf name=1Panel-openresty 2>/dev/null || true)
if [ -n "$CID" ]; then
  docker exec "$CID" openresty -t
  docker exec "$CID" openresty -s reload
  echo "已切换 web upstream -> 127.0.0.1:${PORT} 并重载 OpenResty"
else
  echo "已写入 ${CONF}；未找到 1Panel-openresty 容器，请手动 reload 反代"
fi
