-- 快照镜像从 serviceImage（custom:<id>）拆到独立的 snapshotImageId 列

-- AlterTable
ALTER TABLE "problems" ADD COLUMN     "snapshotImageId" TEXT;

-- 迁移 custom: 引用，丢弃指向不存在记录的引用
UPDATE "problems" p
SET "snapshotImageId" = b."id"
FROM "image_builds" b
WHERE p."serviceImage" LIKE 'custom:%'
  AND b."id" = substring(p."serviceImage" FROM 8);

-- 恢复默认初始镜像并补齐 bootCommand
UPDATE "problems"
SET "serviceImage" = 'node-24',
    "bootCommand" = COALESCE(
      NULLIF(TRIM("bootCommand"), ''),
      '[install-pnpm] npm install --global pnpm@9.15.9' || chr(10) ||
      '[install] pnpm --dir ./' || COALESCE(NULLIF("judgeUploadPath", ''), 'project') || ' install'
    )
WHERE "serviceImage" LIKE 'custom:%'
  AND "problemType" = 'backend_service';

UPDATE "problems"
SET "serviceImage" = NULL
WHERE "serviceImage" LIKE 'custom:%';

-- CreateIndex
CREATE INDEX "problems_snapshotImageId_idx" ON "problems"("snapshotImageId");

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_snapshotImageId_fkey" FOREIGN KEY ("snapshotImageId") REFERENCES "image_builds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
