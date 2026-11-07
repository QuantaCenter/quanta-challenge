CREATE TABLE "problem_quality_reviews" (
  "id" TEXT NOT NULL,
  "problemId" INTEGER NOT NULL,
  "inputHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "report" JSONB,
  "errorCode" TEXT,
  "generation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "problem_quality_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "problem_quality_reviews_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("pid") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "problem_quality_reviews_problemId_inputHash_createdAt_idx"
ON "problem_quality_reviews"("problemId", "inputHash", "createdAt");

-- One active AI audit per problem version; completed tasks retain no payload.
CREATE UNIQUE INDEX "timer_tasks_active_judge_quality_problem_idx"
ON "timer_tasks" (("payload"->>'problemId'))
WHERE "handlerId" = 'judge-quality' AND "status" IN ('pending', 'running');

CREATE INDEX "timer_tasks_pending_judge_quality_run_at_idx"
ON "timer_tasks" ("runAt")
WHERE "handlerId" = 'judge-quality' AND "status" = 'pending';

CREATE INDEX "timer_tasks_running_judge_quality_updated_at_idx"
ON "timer_tasks" ("updatedAt")
WHERE "handlerId" = 'judge-quality' AND "status" = 'running';
