-- 移除文章的英文标识：无业务消费方，唯一性校验随字段一起删除
DROP INDEX IF EXISTS "articles_slug_key";

-- AlterTable
ALTER TABLE "articles" DROP COLUMN "slug";
