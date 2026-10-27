-- 专题排序从专题上的 weight 改为课程上的 topicIds 有序列表

ALTER TABLE "courses" ADD COLUMN "topicIds" JSONB NOT NULL DEFAULT '[]';

-- 按每个课程下专题的 weight（同权重按 id）把现有顺序回填到课程
UPDATE "courses" AS c
SET "topicIds" = sub.list
FROM (
  SELECT "courseId", jsonb_agg("id" ORDER BY "weight", "id") AS list
  FROM "topics"
  GROUP BY "courseId"
) AS sub
WHERE sub."courseId" = c."id";

DROP INDEX "topics_courseId_weight_idx";

ALTER TABLE "topics" DROP COLUMN "weight";
