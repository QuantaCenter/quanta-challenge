BEGIN;

-- Rename existing objects in place so project files, tags and import history survive.
ALTER TYPE "TagScope" RENAME VALUE 'lab' TO 'workshop';
ALTER TYPE "LabProjectSource" RENAME TO "WorkshopProjectSource";

ALTER TABLE "lab_projects" RENAME TO "workshop_projects";
ALTER TABLE "lab_templates" RENAME TO "workshop_templates";
ALTER TABLE "lab_categories" RENAME TO "workshop_categories";
ALTER TABLE "lab_github_imports" RENAME TO "workshop_github_imports";
ALTER TABLE "file_systems" RENAME COLUMN "labProjectId" TO "workshopProjectId";

ALTER TABLE "workshop_projects" RENAME CONSTRAINT "lab_projects_pkey" TO "workshop_projects_pkey";
ALTER TABLE "workshop_projects" RENAME CONSTRAINT "lab_projects_ownerId_fkey" TO "workshop_projects_ownerId_fkey";
ALTER TABLE "workshop_projects" RENAME CONSTRAINT "lab_projects_source_check" TO "workshop_projects_source_check";
ALTER INDEX "lab_projects_ownerId_updatedAt_idx" RENAME TO "workshop_projects_ownerId_updatedAt_idx";

ALTER TABLE "workshop_templates" RENAME CONSTRAINT "lab_templates_pkey" TO "workshop_templates_pkey";
ALTER TABLE "workshop_templates" RENAME CONSTRAINT "lab_templates_snapshotImageId_fkey" TO "workshop_templates_snapshotImageId_fkey";

ALTER TABLE "workshop_categories" RENAME CONSTRAINT "lab_categories_pkey" TO "workshop_categories_pkey";
ALTER INDEX "lab_categories_sortOrder_idx" RENAME TO "workshop_categories_sortOrder_idx";

ALTER TABLE "workshop_github_imports" RENAME CONSTRAINT "lab_github_imports_pkey" TO "workshop_github_imports_pkey";
ALTER TABLE "workshop_github_imports" RENAME CONSTRAINT "lab_github_imports_projectId_fkey" TO "workshop_github_imports_projectId_fkey";
ALTER INDEX "lab_github_imports_repositoryId_idx" RENAME TO "workshop_github_imports_repositoryId_idx";

ALTER TABLE "file_systems" RENAME CONSTRAINT "file_systems_labProjectId_fkey" TO "file_systems_workshopProjectId_fkey";
ALTER INDEX "file_systems_labProjectId_key" RENAME TO "file_systems_workshopProjectId_key";

COMMIT;
