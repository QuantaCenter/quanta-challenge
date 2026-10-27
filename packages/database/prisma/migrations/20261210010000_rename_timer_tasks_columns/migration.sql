/*
  Warnings:

  - You are about to drop the column `created_at` on the `timer_tasks` table. All the data in the column will be lost.
  - You are about to drop the column `executed_at` on the `timer_tasks` table. All the data in the column will be lost.
  - You are about to drop the column `handler_id` on the `timer_tasks` table. All the data in the column will be lost.
  - You are about to drop the column `max_attempts` on the `timer_tasks` table. All the data in the column will be lost.
  - You are about to drop the column `run_at` on the `timer_tasks` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `timer_tasks` table. All the data in the column will be lost.
  - Added the required column `handlerId` to the `timer_tasks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `runAt` to the `timer_tasks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `timer_tasks` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "timer_tasks_status_run_at_idx";

-- AlterTable
ALTER TABLE "timer_tasks" DROP COLUMN "created_at",
DROP COLUMN "executed_at",
DROP COLUMN "handler_id",
DROP COLUMN "max_attempts",
DROP COLUMN "run_at",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "handlerId" TEXT NOT NULL,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "runAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "timer_tasks_status_runAt_idx" ON "timer_tasks"("status", "runAt");
