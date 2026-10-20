#!/usr/bin/env bash
# 初始化 web 蓝绿的 upstream 指针文件并检查 OpenResty 是否已接入（幂等，可重复执行）。
# 用法：sudo bash ci/install-web-bluegreen.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "需要 root：sudo bash ci/install-web-bluegreen.sh"; exit 1; }

DOMAIN=${SITE_DOMAIN:-challenge.quantacenter.com}
SITE_DIR=/opt/1panel/www/sites/$DOMAIN
# 宿主机 /opt/1panel/www 在 OpenResty 容器里是 /www。不放进 proxy/：那里的 *.conf 会被按 server 级自动 include
CONF=${WEB_UPSTREAM_CONF:-$SITE_DIR/web-upstream.conf}
INCLUDE_PATH=${WEB_UPSTREAM_INCLUDE:-/www/sites/$DOMAIN/web-upstream.conf}
BLUE_PORT=${WEB_SLOT_BLUE_PORT:-3000}
GREEN_PORT=${WEB_SLOT_GREEN_PORT:-3002}

[ -d "$SITE_DIR" ] || { echo "找不到 $SITE_DIR，用 SITE_DOMAIN=<域名> 指定"; exit 1; }

# 已有指针文件就是线上真实流向，重跑时绝不覆盖
if [ -f "$CONF" ]; then
  echo "保留现有 upstream：$CONF -> $(cat "$CONF")"
else
  PORT=$BLUE_PORT
  if [ -n "$(docker ps -q --filter label=com.docker.compose.project=qc-web-green --filter label=com.docker.compose.service=challenge-web-app)" ]; then
    PORT=$GREEN_PORT
  fi
  printf 'set $web_backend 127.0.0.1:%s;\n' "$PORT" > "$CONF"
  chmod 644 "$CONF"
  echo "已创建 upstream：$CONF -> 127.0.0.1:$PORT"
fi

CID=$(docker ps -qf name=1Panel-openresty)
[ -n "$CID" ] || { echo "未找到 1Panel-openresty 容器"; exit 1; }
docker exec "$CID" test -f "$INCLUDE_PATH" || {
  echo "OpenResty 容器内看不到 $INCLUDE_PATH：检查 1Panel 的目录挂载，或用 WEB_UPSTREAM_INCLUDE 指定容器内路径"
  exit 1
}

if docker exec "$CID" openresty -T 2>/dev/null | grep -qF "# configuration file $INCLUDE_PATH:"; then
  echo "OpenResty 已 include $INCLUDE_PATH，蓝绿切流可用"
  exit 0
fi

cat <<EOF

OpenResty 尚未接入指针文件。请在站点反代 web-app 的 location 里（通常是 1Panel 反向代理生成的
$SITE_DIR/proxy/*.conf），把
  proxy_pass http://127.0.0.1:3000;
改为
  include $INCLUDE_PATH;
  proxy_pass http://\$web_backend;
然后：
  docker exec $CID openresty -t && docker exec $CID openresty -s reload
  sudo bash ci/install-web-bluegreen.sh   # 再跑一次确认

注意：在 1Panel 面板里重新保存该反向代理会重写这个文件，之后需要重新改并重跑本脚本。
未接入前 webhook 会拒绝 web-app 的蓝绿发布（不会停旧实例）。
EOF
exit 1
