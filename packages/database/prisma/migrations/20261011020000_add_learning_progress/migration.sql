-- CreateEnum
CREATE TYPE "LearningKind" AS ENUM ('ARTICLE', 'TOPIC', 'COURSE', 'PROBLEM');

-- CreateTable
CREATE TABLE "learning_visits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LearningKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_completions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LearningKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_visits_userId_kind_targetId_key" ON "learning_visits"("userId", "kind", "targetId");

-- CreateIndex
CREATE INDEX "learning_visits_userId_kind_visitedAt_idx" ON "learning_visits"("userId", "kind", "visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "learning_completions_userId_kind_targetId_key" ON "learning_completions"("userId", "kind", "targetId");

-- CreateIndex
CREATE INDEX "learning_completions_userId_kind_idx" ON "learning_completions"("userId", "kind");

-- AddForeignKey
ALTER TABLE "learning_visits" ADD CONSTRAINT "learning_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_completions" ADD CONSTRAINT "learning_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
