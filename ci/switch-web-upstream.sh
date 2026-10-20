#!/usr/bin/env bash
# 切换 OpenResty 反代的 web-app 后端端口（蓝绿 active slot）。用法：sudo bash ci/switch-web-upstream.sh 3002
# 任何一步失败都以非 0 退出，且指针文件保持原值：webhook 据此判断「未切流」，不会去停旧实例。
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "需要 root"; exit 1; }

PORT=${1:?用法: switch-web-upstream.sh <host-port>}
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "端口非法：$PORT"; exit 1; }
DOMAIN=${SITE_DOMAIN:-challenge.quantacenter.com}
# 1Panel 把宿主机 /opt/1panel/www 挂到 OpenResty 容器的 /www，两侧路径不同
CONF=${WEB_UPSTREAM_CONF:-/opt/1panel/www/sites/$DOMAIN/web-upstream.conf}
INCLUDE_PATH=${WEB_UPSTREAM_INCLUDE:-/www/sites/$DOMAIN/web-upstream.conf}

[ -f "$CONF" ] || { echo "找不到 $CONF，先运行 sudo bash ci/install-web-bluegreen.sh"; exit 1; }
CID=$(docker ps -qf name=1Panel-openresty)
[ -n "$CID" ] || { echo "未找到 1Panel-openresty 容器"; exit 1; }

# 站点 location 没 include 指针文件时改了也不生效，继续下去旧实例会被停掉 → 停机
if ! docker exec "$CID" openresty -T 2>/dev/null | grep -qF "# configuration file $INCLUDE_PATH:"; then
  echo "OpenResty 生效配置里没有 include $INCLUDE_PATH，拒绝切换（见 ci/README.md「Web 蓝绿」）"
  exit 1
fi

BAK=$(mktemp)
trap 'rm -f "$BAK"' EXIT
cp "$CONF" "$BAK"
printf 'set $web_backend 127.0.0.1:%s;\n' "$PORT" > "$CONF.tmp"
chmod 644 "$CONF.tmp"
mv "$CONF.tmp" "$CONF"

if ! docker exec "$CID" openresty -t || ! docker exec "$CID" openresty -s reload; then
  cp "$BAK" "$CONF"
  docker exec "$CID" openresty -s reload || true
  echo "切换失败，已恢复 $CONF：$(cat "$CONF")"
  exit 1
fi
echo "已切换 web upstream -> 127.0.0.1:${PORT} 并重载 OpenResty"
