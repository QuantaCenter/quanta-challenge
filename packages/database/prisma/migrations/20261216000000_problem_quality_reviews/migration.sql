CREATE TABLE "problem_quality_reviews" (
  "id" TEXT NOT NULL,
  "problemId" INTEGER NOT NULL,
  "inputHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "report" JSONB,
  "errorCode" TEXT,
  "taskStatus" TEXT NOT NULL DEFAULT 'done',
  "taskPayload" JSONB,
  "generation" JSONB,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "problem_quality_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "problem_quality_reviews_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("pid") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "problem_quality_reviews_problemId_inputHash_createdAt_idx"
ON "problem_quality_reviews"("problemId", "inputHash", "createdAt");
CREATE INDEX "problem_quality_reviews_taskStatus_createdAt_idx" ON "problem_quality_reviews"("taskStatus", "createdAt");
-- A partial unique index prevents concurrent paid reviews for the same version.
CREATE UNIQUE INDEX "problem_quality_reviews_active_problem_key" ON "problem_quality_reviews"("problemId")
WHERE "taskStatus" IN ('pending', 'running');
