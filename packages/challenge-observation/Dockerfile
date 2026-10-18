# syntax=docker/dockerfile:1
# 无 monorepo 依赖，产物为单个自包含 JS 文件
# 构建上下文是仓库根目录（与其它镜像一致，见 .github/workflows/publish-images.yml 的 context: .）
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
COPY packages/challenge-observation/package.json ./
RUN pnpm install --no-frozen-lockfile
COPY packages/challenge-observation/tsconfig.json ./
COPY packages/challenge-observation/scripts ./scripts
COPY packages/challenge-observation/src ./src
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
USER node
COPY --from=build /app/dist/server.cjs ./server.cjs
ENV OBS_PORT=9310 \
    OBS_DB_PATH=/data/observation.sqlite3
EXPOSE 9310
CMD ["node", "server.cjs"]
