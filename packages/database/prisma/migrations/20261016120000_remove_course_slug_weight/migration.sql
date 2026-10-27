-- 课程去掉英文标识（slug）与排序权重：课程一律用数字 id / cuid 标识，列表按创建时间排序

DROP INDEX "courses_slug_key";

ALTER TABLE "courses" DROP COLUMN "slug";

-- 删除 weight 列时，PostgreSQL 会连带删掉包含它的复合索引 courses_status_weight_idx，
-- 因此这里不再显式 DROP（显式删会报 index does not exist，导致整条迁移链无法重放）

ALTER TABLE "courses" DROP COLUMN "weight";

CREATE INDEX "courses_status_idx" ON "courses"("status");
