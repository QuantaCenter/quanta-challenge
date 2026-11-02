-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('bug', 'problem_judge', 'suggestion', 'other');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('pending', 'working', 'resolved', 'closed');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FEEDBACK';

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" SERIAL NOT NULL,
    "submissionKey" TEXT,
    "type" "FeedbackType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'pending',
    "pagePath" TEXT,
    "diagnostic" JSONB,
    "baseProblemId" INTEGER,
    "authorId" TEXT NOT NULL,
    "reply" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_events" (
    "id" SERIAL NOT NULL,
    "feedbackId" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL,
    "reply" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_attachments" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "feedbackId" INTEGER,
    "mimeType" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedbacks_submissionKey_key" ON "feedbacks"("submissionKey");

-- CreateIndex
CREATE INDEX "feedbacks_authorId_createdAt_idx" ON "feedbacks"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_status_createdAt_idx" ON "feedbacks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_events_feedbackId_id_idx" ON "feedback_events"("feedbackId", "id");

-- CreateIndex
CREATE INDEX "feedback_attachments_ownerId_createdAt_idx" ON "feedback_attachments"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_baseProblemId_fkey" FOREIGN KEY ("baseProblemId") REFERENCES "base_problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
