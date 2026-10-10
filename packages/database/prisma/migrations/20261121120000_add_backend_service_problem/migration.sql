-- CreateEnum
CREATE TYPE "ProblemType" AS ENUM ('frontend', 'backend_service');

-- AlterTable
ALTER TABLE "problems"
    ADD COLUMN "problemType" "ProblemType" NOT NULL DEFAULT 'frontend',
    ADD COLUMN "serviceImage" TEXT,
    ADD COLUMN "servicePort" INTEGER NOT NULL DEFAULT 3000;
