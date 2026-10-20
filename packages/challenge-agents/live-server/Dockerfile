# syntax=docker/dockerfile:1
# 配置与启动脚本须内联在本文件：CI 变更检测只监听这个 Dockerfile。
FROM nginx:1.28-alpine

WORKDIR /app

# user root：快照文件权限取决于宿主机 umask，非 root worker 可能读不到。
COPY <<"EOF" /etc/nginx/nginx.conf
user root;
worker_processes 1;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;

events {
   worker_connections 256;
}

http {
   include /etc/nginx/mime.types;
   types {
      text/javascript mjs;
   }
   default_type application/octet-stream;
   access_log off;
   sendfile on;
   server_tokens off;

   server {
      listen 3000;
      root /app/project;
      index index.html;
      autoindex off;
      absolute_redirect off;

      add_header Cache-Control "no-store" always;

      location / {
         try_files $uri $uri/ =404;
      }
   }
}
EOF

# 调度器以 stdout 中的 `Ready` 判定就绪，必须在端口可响应后再输出。
COPY --chmod=755 <<"EOF" /usr/local/bin/start-live-server
#!/bin/sh
nginx -g 'daemon off;' &
pid=$!
trap 'kill -QUIT "$pid" 2>/dev/null' TERM INT QUIT

until wget -S -q -O /dev/null http://127.0.0.1:3000/ 2>&1 | grep -q 'HTTP/'; do
   kill -0 "$pid" 2>/dev/null || exit 1
   sleep 0.05
done
echo "Ready"

wait "$pid"
EOF

ENTRYPOINT []
CMD ["/usr/local/bin/start-live-server"]

EXPOSE 3000
