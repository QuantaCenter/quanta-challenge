#!/usr/bin/env bash
# 初始化 web 蓝绿：upstream 指针文件 + OpenResty include 片段。用法：sudo bash ci/install-web-bluegreen.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "需要 root：sudo bash ci/install-web-bluegreen.sh"; exit 1; }

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN=${SITE_DOMAIN:-challenge.quantacenter.com}
PROXY_DIR=/opt/1panel/www/sites/$DOMAIN/proxy
CONF_SNIPPET=$PROXY_DIR/web-bluegreen-upstream.conf
UPSTREAM=${WEB_UPSTREAM_CONF:-/www/qc-secrets/web-upstream.conf}
STATE_FILE=${STATE_FILE:-/var/lib/quanta-deploy/state.json}

mkdir -p "$(dirname "$UPSTREAM")"
if [ ! -f "$UPSTREAM" ]; then
  printf 'set $web_backend 127.0.0.1:3000;\n' > "$UPSTREAM"
  echo "已创建默认 upstream：$UPSTREAM（blue@3000）"
fi

[ -d "$PROXY_DIR" ] || { echo "找不到 $PROXY_DIR，用 SITE_DOMAIN=<域名> 指定"; exit 1; }

cat > "$CONF_SNIPPET" <<NEOF
# Web 蓝绿：由 ci/switch-web-upstream.sh 写入 $UPSTREAM
include $UPSTREAM;
NEOF

if [ -f "$STATE_FILE" ] && command -v jq >/dev/null 2>&1; then
  ACTIVE=$(jq -r '.activeWebSlot // empty' "$STATE_FILE")
  PORT=$(jq -r '.webSlots.blue.hostPort // 3000' "$STATE_FILE")
  [ "$ACTIVE" = green ] && PORT=$(jq -r '.webSlots.green.hostPort // 3002' "$STATE_FILE")
  bash "$CI_DIR/switch-web-upstream.sh" "$PORT"
else
  bash "$CI_DIR/switch-web-upstream.sh" 3000
fi

cat <<EOF

已在 $CONF_SNIPPET 写入 include。

请在站点主 location（反代 web-app 的那段）里、proxy_pass 之前加入：
  include $CONF_SNIPPET;
  proxy_pass http://\$web_backend;

若原来是 proxy_pass http://127.0.0.1:3000; 请改为上述两行，然后 reload OpenResty。

首次从单容器迁移：停主栈 web-app，由 webhook 在 qc-web-blue@3000 接管：
  cd ${REPO_DIR:-/www/quanta-challenge}
  docker compose --env-file /www/qc-secrets/prod.env -f docker/docker-compose.yaml \\
    -f docker/docker-compose.override.yaml stop challenge-web-app

调度器回调请在 prod.env 设置 APP_SERVER_URL=\${APP_SERVER}（走 OpenResty，与蓝绿切流一致）。
EOF
