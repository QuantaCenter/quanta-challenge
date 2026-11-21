BEGIN;

ALTER TYPE "WorkshopProjectSource" ADD VALUE 'local';

ALTER TABLE "workshop_projects"
  DROP CONSTRAINT "workshop_projects_source_check",
  ADD CONSTRAINT "workshop_projects_source_check" CHECK (
    (source = 'template' AND "templateId" IS NOT NULL AND length("templateId") > 0)
    OR (source <> 'template' AND "templateId" IS NULL)
  );

COMMIT;
