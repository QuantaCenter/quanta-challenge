-- CreateTable
CREATE TABLE "lab_templates" (
    "id" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "description" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icon" TEXT,
    "entry" TEXT,
    "installCommand" TEXT,
    "startCommand" TEXT,
    "readme" TEXT,
    "files" JSONB,
    "snapshotImageId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "lab_templates" ADD CONSTRAINT "lab_templates_snapshotImageId_fkey" FOREIGN KEY ("snapshotImageId") REFERENCES "image_builds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
