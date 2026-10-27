-- 一个用户可保存多个设置项（原 userId 单列唯一索引会限制为每用户一条）
DROP INDEX IF EXISTS "user_settings_userId_key";

-- Make sure Prisma Client is regenerated:
-- npx prisma generate
