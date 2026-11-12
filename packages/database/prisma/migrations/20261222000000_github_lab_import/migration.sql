CREATE TYPE "LabProjectSource" AS ENUM ('template', 'github');
ALTER TABLE "lab_projects" ADD COLUMN "source" "LabProjectSource" NOT NULL DEFAULT 'template', ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "lab_projects" ADD CONSTRAINT "lab_projects_source_check" CHECK (
  (source = 'template' AND "templateId" IS NOT NULL AND length("templateId") > 0)
  OR (source = 'github' AND "templateId" IS NULL)
);
CREATE TABLE "github_connections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "githubUserId" BIGINT NOT NULL UNIQUE,
  "login" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "accessTokenEncrypted" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenEncrypted" TEXT,
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "credentialKeyVersion" INTEGER,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "lab_github_imports" (
  "projectId" TEXT NOT NULL PRIMARY KEY REFERENCES "lab_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "repositoryId" BIGINT NOT NULL,
  "ownerLogin" TEXT NOT NULL,
  "repositoryName" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "branchName" TEXT NOT NULL,
  "commitSha" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "lab_github_imports_repositoryId_idx" ON "lab_github_imports"("repositoryId");
