#!/usr/bin/env bash
# 把部署 webhook 挂到既有站点的一个路径上：不新增子域名，也不用再签证书。
# 站点配置里本来就有 include .../proxy/*.conf，这里是 1Panel 的正规扩展点。
# 用法：sudo bash ci/expose-hook-path.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "需要 root：sudo bash ci/expose-hook-path.sh"; exit 1; }

DOMAIN=${SITE_DOMAIN:-challenge.quantacenter.com}
PROXY_DIR=/opt/1panel/www/sites/$DOMAIN/proxy
CONF=$PROXY_DIR/deploy-webhook.conf
[ -d "$PROXY_DIR" ] || { echo "找不到 $PROXY_DIR，用 SITE_DOMAIN=<域名> 指定既有站点"; exit 1; }

cat > "$CONF" <<'EOF'
# 部署 webhook：CI 镜像发布回调（契约 docs/IMAGE_WEBHOOK.md）
# 鉴权靠 HMAC-SHA256 签名 + 时间戳窗口，方法只放行 POST
location = /hooks/images {
    if ($request_method != POST) { return 405; }
    proxy_pass http://127.0.0.1:19000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 20s;
    proxy_send_timeout 20s;
}
EOF

CID=$(docker ps -qf name=1Panel-openresty)
docker exec "$CID" openresty -t
docker exec "$CID" openresty -s reload
echo "已挂载：https://$DOMAIN/hooks/images"
curl -s -o /dev/null -w "  GET（期望 405）：%{http_code}\n" --max-time 10 "https://$DOMAIN/hooks/images"
curl -s -o /dev/null -w "  无签名 POST（期望 403）：%{http_code}\n" --max-time 10 -X POST "https://$DOMAIN/hooks/images" -H 'X-Quanta-Event: images.published' -d '{}'
