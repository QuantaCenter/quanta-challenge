-- CreateTable
CREATE TABLE "image_builds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "buildFile" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'building',
    "fileId" TEXT,
    "fileName" TEXT,
    "compression" TEXT NOT NULL DEFAULT 'gzip',
    "sizeBytes" INTEGER,
    "compressedSizeBytes" INTEGER,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_builds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "image_builds_fileName_key" ON "image_builds"("fileName");
