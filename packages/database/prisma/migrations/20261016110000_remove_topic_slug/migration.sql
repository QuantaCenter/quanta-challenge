-- 专题去掉英文标识（slug）：专题一律用数字 id / cuid 标识

DROP INDEX "topics_courseId_slug_key";

ALTER TABLE "topics" DROP COLUMN "slug";

CREATE INDEX "topics_courseId_idx" ON "topics"("courseId");
