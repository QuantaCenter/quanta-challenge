# Quanta Challenge - AI Coding Agent Guide

## Architecture Overview

**Quanta Challenge** is a full-stack online coding challenge platform with three major service boundaries:

1. **App (`packages/app`)**: Nuxt 4 + Vue 3 frontend with SSR, tRPC API, and Monaco editor
2. **Judge (`packages/judge`)**: Hono-based judging service managing Docker containers and task queues
3. **Judge Machine (`packages/docker/judge-machine`)**: Dockerized Playwright-based automated testing environment
4. **Database (`packages/database`)**: Shared Prisma schema with PostgreSQL

### Key Data Flow

```text
User submits code → App (tRPC) → Judge (BullMQ) → Docker Network
                                      ↓
                    Judge Machine (Playwright) ← Live Server Container
                                      ↓
                    Results → Judge → App → User
```

## Critical Workflows

### Development Setup

```bash
# Install dependencies (uses pnpm workspace)
pnpm install

# Database migrations (ALWAYS run after schema changes)
cd packages/database
pnpm prisma:update  # Migrates + generates client + name mapping

# Start app (dev mode with hot reload)
cd packages/app
pnpm dev  # Runs on http://localhost:3000

# Start judge service
cd packages/judge
pnpm dev  # Runs on http://localhost:1888 (default)
```

### Docker Image Management

```bash
# Build judge-machine image (required for judging)
cd packages/docker/judge-machine
pnpm docker:build  # Creates "node-playwright-judge-machine"

# Build live-server image
cd packages/docker/live-server
pnpm docker:build

# Full deployment
sh scripts/migrate.sh  # Builds everything + starts services
```

### Database Schema Changes

**CRITICAL**: After ANY `schema.prisma` modification:

```bash
cd packages/database
pnpm prisma:update  # Three-step process:
# 1. prisma migrate dev (creates migration)
# 2. prisma generate (regenerates client)
# 3. node prisma/name-map/generate-script.mjs (generates type-safe table mappings)
```

The name mapping script (`generate-script.mjs`) creates `prisma/name-map/_output.ts` with:

- `schemaToRealMap`: Prisma model → DB table name
- `realToSchemaMap`: DB table → Prisma model
- `nestedModelMapping`: Type-safe relation paths

## Project-Specific Patterns

### 1. Monorepo Workspace Structure

- Uses `pnpm-workspace.yaml` with `packages/*` and `packages/docker/*`
- Shared packages use `workspace:^` protocol (e.g., `@challenge/database`, `@challenge/shared`)
- TypeScript paths configured per package, not globally

### 2. Frontend Conventions (App)

**File Organization:**

- `app/pages/` → Nuxt file-based routing
- `app/components/st/` → Design system components (prefix `St`)
- `app/composables/` → Vue composables (prefix `use-`)
- `server/trpc/routes/` → tRPC API endpoints

**Key Composables:**

- `useWebContainer()`: Manages in-browser Node.js runtime for code execution
- `useDialog()`: Global dialog API (confirm/prompt/custom) - works SSR-safe
- `useEventEmitter()`: Cross-component event bus (scoped by emitterId)

**tRPC Structure:**

```typescript
// packages/app/server/trpc/routes/index.ts
export const appRouter = router({
  auth: authRouter,      // Authentication
  admin: adminRouter,    // Admin-only operations
  public: publicRouter,  // Unauthenticated routes
  protected: protectedRouter  // User-authenticated routes
});
```

### 3. Judge Service Architecture

**Task Queue (BullMQ + Redis):**

```typescript
// packages/judge/src/mq/judge-processor/index.ts
// Job flow: App → Redis → Worker Pool (3 workers) → Docker → Results
```

**Docker Integration:**

- Creates isolated network `orange-network`
- Spins up ephemeral live-server containers for each submission
- Persistent judge-machine container handles Playwright automation
- WebSocket communication between judge service and judge-machine

**Judge Machine Protocol:**

```typescript
// packages/docker/judge-machine/protocol/index.ts
// Uses JRTP (Judge Result Transfer Protocol) for binary message packing
// WebSocket at ws://localhost:1889/link
```

### 4. WebContainer Integration

**Frontend Code Execution:**

```typescript
// packages/app/app/pages/challenge/_composables/use-web-container/index.ts
// Boots in-browser Node.js runtime for live previews
// File system mapping: Record<string, string> ↔ WebContainer FileSystemTree
```

**Key Methods:**

- `mountFileSystem(pathContentMap)`: Loads user's project files
- `makeSnapshot(dirPath)`: Exports current state for judging
- `runCommand(commandLine)`: Executes npm/node commands

### 5. Component Communication

**Event Patterns:**

```typescript
// Global event emitter (for cross-component, same-page events)
const { emit, event } = useEventEmitter('challenge-layout', 'commit');

// VueUse event bus (for fire-and-forget)
const emitter = useEventBus<{ path: string }>('file-delete-event');
emitter.emit({ path: '/file.js' });
```

### 6. Database Relations & Queries

**Problem Versioning:**

- `BaseProblems` (base entity) → `Problems[]` (versions)
- `currentPid` references active published version
- `ProblemVersionTransitions` tracks all version changes

**Judge Records:**

- `JudgeRecords.type`: `audit` (validation) vs `judge` (user submission)
- `ShadowFile`: Stores judge-generated artifacts (images/text)
- `TemplateJudgeRecords`: Links template validation results

### 7. Security & CORS

**Nuxt Config (`packages/app/nuxt.config.ts`):**

```typescript
// Challenge routes require special headers for WebContainer/SharedArrayBuffer
routeRules: {
  '/challenge/**': {
    security: {
      headers: {
        crossOriginOpenerPolicy: 'same-origin',
        crossOriginEmbedderPolicy: 'require-corp'
      }
    }
  }
}
```

### 8. Prisma Workflow

**Never directly import from `@prisma/client`:**

```typescript
// ❌ WRONG
import { PrismaClient } from '@prisma/client';

// ✅ CORRECT (uses shared instance)
import { prisma } from '@challenge/database';
```

## Common Tasks

### Add New tRPC Endpoint

1. Create procedure in `packages/app/server/trpc/routes/{category}/{name}.ts`
2. Export from category index (e.g., `routes/protected/index.ts`)
3. Use in frontend: `const { $trpc } = useNuxtApp(); await $trpc.protected.myEndpoint.query()`

### Add New Database Model

1. Modify `packages/database/prisma/schema.prisma`
2. Run `pnpm prisma:update` (handles migration + codegen)
3. Import `prisma` from `@challenge/database`

### Add Judge Machine Test Logic

1. Edit judge script in `packages/app` problem detail
2. Use exposed API: `defineTestHandler(async ({ page, $ }) => { ... })`
3. Available methods: `$.saveOrCompare()`, `$.defineCheckPoint()`, `$.expect()`, `page.waitForNetworkIdle({ timeout })`（上限 5000ms，先挂等待再触发动作）

### Debug Docker Containers

```bash
# List running containers
docker ps

# View judge-machine logs
docker logs <container-id>

# Check network connectivity
docker network inspect orange-network

# Restart judge-machine
cd packages/judge && pnpm prod  # Auto-rebuilds container
```

## Testing

本仓库当前不包含自动化测试（单测 / e2e / 冒烟脚本已从版本库移除）。
验证改动的方式：`pnpm typecheck`、各包 `pnpm build`，以及运行时的 `/healthz` 与日志。

## Environment Variables

Required for app service:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis for BullMQ
- `JUDGE_SERVER`: Judge service URL (default: `http://localhost:1888`)
- `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`: JWT secrets

## Anti-Patterns to Avoid

1. **DON'T** run `prisma migrate` without regenerating name mappings
2. **DON'T** import Prisma client directly - use shared instance from `@challenge/database`
3. **DON'T** call `useDialog()` methods in SSR context without safeguards
4. **DON'T** forget to start Docker daemon before running judge service
5. **DON'T** use `fs` operations in browser code - use WebContainer API

## Search System

**Shared Config:**

- `packages/shared/configs/search-config.ts` defines all search types
- Types: `problem`, `daily-problem`, `user`, `tag`, `page-section`
- Centralized validation and sorting logic

## Key Files to Reference

- Architecture: `packages/app/nuxt.config.ts`, `packages/judge/src/index.ts`
- Schemas: `packages/database/prisma/schema.prisma`
- Judge Flow: `packages/judge/src/mq/judge-processor/index.ts`
- WebContainer: `packages/app/app/pages/challenge/_composables/use-web-container/index.ts`
- Dialog System: `packages/app/app/composables/use-dialog.ts`
- Component Library: `packages/app/app/components/st/`
