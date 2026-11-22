CREATE TYPE "FeedbackCategory" AS ENUM ('bug', 'suggestion', 'other');

CREATE TABLE "feedback" (
  "id" TEXT NOT NULL,
  "category" "FeedbackCategory" NOT NULL,
  "description" VARCHAR(2000) NOT NULL,
  "contact" VARCHAR(254),
  "pagePath" VARCHAR(500),
  "traceId" VARCHAR(32),
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),

  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "feedback_createdAt_id_idx" ON "feedback"("createdAt", "id");
CREATE INDEX "feedback_reviewedAt_createdAt_id_idx" ON "feedback"("reviewedAt", "createdAt", "id");
CREATE INDEX "feedback_userId_idx" ON "feedback"("userId");
