# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
COPY packages/challenge-data-mcp/package.json ./
RUN pnpm install --no-frozen-lockfile
COPY packages/challenge-data-mcp/tsconfig.json ./
COPY packages/challenge-data-mcp/src ./src
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
USER node
COPY --from=build /app/dist/server.js ./server.js
ENV DATA_MCP_HOST=0.0.0.0 \
    DATA_MCP_PORT=9320 \
    DATA_MCP_AUDIT_DB_PATH=/data/audit.sqlite3
EXPOSE 9320
CMD ["node", "server.js"]
