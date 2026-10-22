-- 项目版本号：重置时递增，文件同步请求携带加载时的版本，服务端校验以拒绝重置前发出的旧请求
ALTER TABLE "projects" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
