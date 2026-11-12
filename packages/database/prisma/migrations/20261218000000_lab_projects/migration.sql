-- AlterTable
ALTER TABLE "file_systems" ADD COLUMN     "labProjectId" TEXT;

-- CreateTable
CREATE TABLE "lab_projects" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_projects_ownerId_updatedAt_idx" ON "lab_projects"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_systems_labProjectId_key" ON "file_systems"("labProjectId");

-- AddForeignKey
ALTER TABLE "file_systems" ADD CONSTRAINT "file_systems_labProjectId_fkey" FOREIGN KEY ("labProjectId") REFERENCES "lab_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_projects" ADD CONSTRAINT "lab_projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

