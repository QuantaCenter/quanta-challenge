FROM node:24-slim

# 镜像源可覆盖，默认走官方源（受限网络下用 --build-arg APT_MIRROR=mirrors.ustc.edu.cn）
ARG APT_MIRROR=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"

# ---------------------------------------------------------------------------
# 这是「后端服务题目」的默认基础镜像。
#
# 设计目标：足够基础、足够小，同时能覆盖绝大多数 Node 后端服务题：
#   · openssl/libssl3 —— Prisma 等依赖的引擎需要（与 cloud-function 镜像一致）
#   · python3/make/g++ —— 少数含原生扩展（bcrypt/sharp 等）的题目需要 node-gyp
#   · pnpm@9.15.9      —— 必须与调度器预热 store 的 pnpm 大版本一致，否则 100% 未命中
#
# 题目作者可以换更专门的镜像（python:3.12-slim 等），只要同样提供
# /usr/local/bin/quanta-entrypoint.sh 这一层约定即可。
# ---------------------------------------------------------------------------
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
