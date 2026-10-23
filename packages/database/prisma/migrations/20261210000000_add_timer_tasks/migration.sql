-- CreateEnum
CREATE TYPE "TimerTaskStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "timer_tasks" (
    "id" TEXT NOT NULL,
    "handler_id" TEXT NOT NULL,
    "payload" JSONB,
    "status" "TimerTaskStatus" NOT NULL DEFAULT 'pending',
    "run_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timer_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timer_tasks_status_run_at_idx" ON "timer_tasks"("status", "run_at");
