# syntax=docker/dockerfile:1
# 无 monorepo 依赖，产物为单个自包含 JS 文件
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
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
