-- 搜索功能升级：
-- 1. 为标题/名称类字段添加 pg_trgm GIN 索引，加速 ILIKE '%kw%' 模糊查询
-- 2. 为题面 detail 添加 tsvector 全文索引，支持后续题面全文检索
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "problems_title_trgm_idx"
  ON "problems" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "problems_detail_fts_idx"
  ON "problems" USING gin (to_tsvector('simple', "detail"));

CREATE INDEX IF NOT EXISTS "tags_name_trgm_idx"
  ON "tags" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_name_trgm_idx"
  ON "users" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_display_name_trgm_idx"
  ON "users" USING gin ("displayName" gin_trgm_ops);
