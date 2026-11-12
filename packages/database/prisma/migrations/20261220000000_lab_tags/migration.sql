-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('problem', 'lab');

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "scope" "TagScope" NOT NULL DEFAULT 'problem';

-- CreateIndex
CREATE INDEX "tags_scope_idx" ON "tags"("scope");
