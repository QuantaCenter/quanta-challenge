-- 后端服务题型的初始镜像：从自由填写的镜像名改成注册表 id（破坏性变更，解析只认 id）。
-- 只影响 backend_service 行。命令列（bootCommand / initCommand）不动：
-- initCommand 由出题人自定义，历史值仍然有效；bootCommand 由发布页/CLI 在下次发布时收敛。

UPDATE "problems"
SET "serviceImage" = 'node-24'
WHERE "problemType" = 'backend_service'
  AND COALESCE("serviceImage", '') <> 'node-24';

UPDATE "problems"
SET "servicePort" = 3000
WHERE "problemType" = 'backend_service'
  AND ("servicePort" <= 0 OR "servicePort" > 65535);
