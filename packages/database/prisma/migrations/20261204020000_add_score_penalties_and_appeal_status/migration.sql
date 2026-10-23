-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "appeals" ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "handledById" TEXT,
ADD COLUMN     "status" "AppealStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "score_penalties" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "score_penalties_notificationId_key" ON "score_penalties"("notificationId");

-- CreateIndex
CREATE INDEX "score_penalties_userId_idx" ON "score_penalties"("userId");

-- CreateIndex
CREATE INDEX "appeals_status_idx" ON "appeals"("status");

-- AddForeignKey
ALTER TABLE "score_penalties" ADD CONSTRAINT "score_penalties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_penalties" ADD CONSTRAINT "score_penalties_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

