CREATE TYPE "WorkshopImportStatus" AS ENUM ('importing', 'ready', 'failed');

ALTER TABLE "workshop_projects"
ADD COLUMN "importStatus" "WorkshopImportStatus" NOT NULL DEFAULT 'ready',
ADD COLUMN "importError" TEXT;
