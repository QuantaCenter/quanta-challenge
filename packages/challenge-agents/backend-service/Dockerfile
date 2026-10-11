FROM node:24-slim

# 镜像源可覆盖，默认走官方源（受限网络下用 --build-arg APT_MIRROR=mirrors.ustc.edu.cn）
ARG APT_MIRROR=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"

RUN if [ -n "$APT_MIRROR" ]; then \
       sed -i "s/deb.debian.org/$APT_MIRROR/g" /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        openssl libssl3 ca-certificates curl python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# 版本必须锁死：store 的磁盘布局与 pnpm 大版本绑定（pnpm 9 = v3/，pnpm 10 = v10/），
# 一旦漂到 10，调度器预热的缓存全部 miss，且症状是「离线安装缺包」。
RUN npm config set registry ${NPM_REGISTRY} && \
    npm install -g pnpm@9.15.9

# 入口脚本：离线安装 + 启动 + 就绪探测（详见同目录 entrypoint.sh 的注释）
COPY packages/challenge-agents/backend-service/entrypoint.sh /usr/local/bin/quanta-entrypoint.sh
RUN chmod +x /usr/local/bin/quanta-entrypoint.sh

# 题目快照会挂到这里（调度器把快照 Source 绑到 /app，题目目录是 /app/<judgeUploadPath>）
WORKDIR /app

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/quanta-entrypoint.sh"]
