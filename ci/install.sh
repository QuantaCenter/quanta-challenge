#!/usr/bin/env bash
# 安装/更新部署 webhook 服务（systemd）。用法：sudo bash ci/install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "需要 root：sudo bash ci/install.sh"; exit 1; }

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$CI_DIR")"
SECRET_FILE=/www/qc-secrets/deploy-webhook.env
STATE_FILE=/var/lib/quanta-deploy/state.json
LOG_FILE=/var/log/quanta-deploy-webhook.log
UNIT=/etc/systemd/system/quanta-deploy-webhook.service
NODE="$(command -v node)"
[ -n "$NODE" ] || { echo "未找到 node"; exit 1; }

mkdir -p "$(dirname "$STATE_FILE")"; chmod 700 "$(dirname "$STATE_FILE")"
touch "$LOG_FILE"; chmod 640 "$LOG_FILE"

# 密钥只在部署机上生成，同一份要填进 GitHub 仓库 secrets 的 DEPLOY_WEBHOOK_SECRET
if [ ! -f "$SECRET_FILE" ]; then
  mkdir -p "$(dirname "$SECRET_FILE")"
  printf 'DEPLOY_WEBHOOK_SECRET=%s\n' "$(openssl rand -hex 32)" > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  echo "已生成 $SECRET_FILE"
fi

# WEB_APP_REF 注入：compose override 里 web-app 的 image 必须是变量，否则 webhook 无法切换版本
OVERRIDE="$REPO_DIR/docker/docker-compose.override.yaml"
if [ -f "$OVERRIDE" ] && ! grep -q 'WEB_APP_REF' "$OVERRIDE"; then
  cp "$OVERRIDE" "$OVERRIDE.bak-$(date +%s)"
  awk '
    /^[[:space:]]*image:[[:space:]]*ghcr\.io\/quantacenter\/quanta-challenge/ {
      print "    image: ${WEB_APP_REF:-" $2 "}"; next
    } { print }' "$OVERRIDE" > "$OVERRIDE.tmp" && mv "$OVERRIDE.tmp" "$OVERRIDE"
  echo "已把 $OVERRIDE 的 web-app image 改为 \${WEB_APP_REF:-...}"
fi

sed -e "s|__REPO_DIR__|$REPO_DIR|g" -e "s|__SECRET_FILE__|$SECRET_FILE|g" -e "s|__NODE__|$NODE|g" \
  "$CI_DIR/quanta-deploy-webhook.service" > "$UNIT"
chmod 644 "$UNIT"

systemctl daemon-reload
systemctl enable quanta-deploy-webhook >/dev/null
systemctl restart quanta-deploy-webhook
sleep 1
systemctl --no-pager --lines=5 status quanta-deploy-webhook || true

curl -s --max-time 10 http://127.0.0.1:19000/health && echo || echo "健康检查未响应，见 journalctl -u quanta-deploy-webhook"

cat <<EOF

下一步：
1) 在 GitHub 仓库 secrets 里设置
     DEPLOY_WEBHOOK_URL=https://challenge.quantacenter.com/hooks/images
     DEPLOY_WEBHOOK_SECRET=$(sed -n 's/^DEPLOY_WEBHOOK_SECRET=//p' "$SECRET_FILE")
2) 把端点挂到现有站点上（不新增子域名/证书）：sudo bash ci/expose-hook-path.sh
EOF
