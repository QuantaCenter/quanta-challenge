# WebContainer 回迁部署

保留 `20261214000000_vivari_image_format` 原迁移和 `image_builds.formatVersion` 列；不要删除或修改已应用的迁移。0 表示 WebContainer 快照，1 表示 Vivari 镜像。应用只允许绑定和下载版本 0，已绑定版本 1 的题目会明确提示重建。不要直接修改版本号来转换镜像。

部署前备份数据库及 local_store，暂停镜像发布和题目绑定修改。应用正常执行 Prisma migrate deploy 后，在镜像管理页找到“需重建”的镜像，使用保存的构建文件重新构建并上传；上传会保留镜像 ID 和题目绑定，并在成功时写入版本 0。也可以从备份恢复匹配的 WebContainer 文件及对应元数据。上传会替换并尝试删除旧文件，因此先备份。对每个受影响的题目验证启动、预览和提交后再开放使用；历史题目版本及未绑定的镜像也应按需检查。不要用旧数据库整库覆盖生产的新数据。

可用以下查询检查所有版本 1 镜像及当前题目引用：

```sql
SELECT b.id, b.name, b.status, b."fileId", b."fileName", p.pid, p.title
FROM image_builds b
LEFT JOIN (
  problems p JOIN base_problems base ON base."currentPid" = p.pid
) ON p."snapshotImageId" = b.id
WHERE b."formatVersion" = 1
ORDER BY b.name, p.pid;
```
