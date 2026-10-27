-- 课程去掉英文标识（slug）与排序权重：课程一律用数字 id / cuid 标识，列表按创建时间排序

DROP INDEX "courses_slug_key";

ALTER TABLE "courses" DROP COLUMN "slug";

ALTER TABLE "courses" DROP COLUMN "weight";

DROP INDEX "courses_status_weight_idx";

CREATE INDEX "courses_status_idx" ON "courses"("status");
