ALTER TABLE "workshop_github_imports"
ALTER COLUMN "repositoryId" DROP NOT NULL,
ALTER COLUMN "visibility" DROP NOT NULL,
ALTER COLUMN "commitSha" DROP NOT NULL,
ALTER COLUMN "importedAt" DROP NOT NULL,
ALTER COLUMN "importedAt" DROP DEFAULT;

-- 已入队的导入任务也能立即展示来源，不等待 Worker 下载完成。
INSERT INTO "workshop_github_imports"
   ("projectId", "ownerLogin", "repositoryName", "branchName", "commitSha")
SELECT p.id,
   split_part(t.payload->'input'->>'repository', '/', 1),
   split_part(t.payload->'input'->>'repository', '/', 2),
   t.payload->'input'->>'branch',
   t.payload->'input'->>'commitSha'
FROM timer_tasks t
JOIN workshop_projects p ON p.id = t.payload->>'projectId'
WHERE t."handlerId" = 'github-import' AND p.source = 'github'
   AND t.payload->'input'->>'repository' ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
   AND t.payload->'input'->>'branch' IS NOT NULL
ON CONFLICT ("projectId") DO NOTHING;
