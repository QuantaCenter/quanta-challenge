# 题目二进制文件转储与引用：数据模型变更报告

状态：`feat/file-assets` 分支已实施模型、迁移和业务代码；真实数据库尚未迁移，QPC 1.2.3 尚未发布。本文保留设计方案，实际交付状态和上线前事项见第 10 节；沿用原文档路径以保持已有链接有效。

## 1. 目标与设计结论

题目上传的资源可能是图片、音频、视频、字体、WASM、压缩包或其他二进制文件。统一将它们原样写入本地文件存储，题目虚拟文件保留原路径与资源 ID；普通源码继续内联保存，历史 base64 / data URL 图片继续可读。

**新增通用 `FileAsset` 表，通过 `VirtualFiles.assetId` 引用；不复用 `Image` 表。** 既有头像、封面、截图等图片业务继续使用 `Image`。两者可复用底层存储接口，但使用独立实体、存储键空间与生命周期。

首阶段加入**同一上传者范围内的文件去重**：对解码后的原始字节计算 SHA-256，相同上传者的相同内容复用同一个 FileAsset 和磁盘文件。不同上传者独立保存；克隆项目仍可共享模板已有引用，不受此上传去重范围限制。

本文处理题目上传的文件快照。`ImageBuild` 是另一条 gzip WebContainer 启动镜像链路，通过 `Problems.snapshotImageId` 绑定；本文不拆解或重建该归档，也不改动该字段。

## 2. 实施前的现状与影响

| 位置 | 当前行为 | 影响 |
| --- | --- | --- |
| `VirtualFiles.content` | 必填 String，文本和编码后的图片共用 | 新模型需同时支持内联内容与外置资源 |
| `Image` | 含 thumbhash、图片引用关系等图片业务语义 | 不适合承载音频、字体等通用资源 |
| Web `DropUploader/walk-file-list.ts` | 仅 `image/*` 读取 ArrayBuffer，其余使用 `file.text()` | 音频等可能在上传前已因文本解码损坏 |
| CLI `domain/snapshot.ts` | 图片扩展名列表决定是否 base64，否则 UTF-8 解码 | 不能无损打包任意二进制文件 |
| `shared/service/snapshot-content.ts` | 兼容 data URL、图片扩展名裸 base64、历史双层编码 | 保留旧解析分支；新协议不再按扩展名推断编码 |
| WebContainer 文件挂载 | 路径到字符串映射，读取时解码 | 新引用必须先获取真实字节再挂载 |
| 作答 `CommitModal.vue` | 图片扩展名列表决定 base64 / UTF-8 读取 | 即使音频挂载正确，提交打包仍可能再次损坏 |
| 项目克隆 / 重置 | 显式 SQL 复制 path、content 等列 | 必须加入 assetId |
| 参考答案审核 | 字符串快照进入持久化任务 payload | 通用二进制编码必须贯穿审核和判题恢复 |

代码路径均位于 `packages/`：Web 代码在 `challenge-web-app/`，CLI 在 `problem-creator-cli/`，共享解码在 `shared/`，判题文件恢复在 `challenge-judge-scheduler/src/services/temp-file.ts`。

**修正此前结论：仅保留旧上传端并在服务端转储，无法保证新增二进制类型无损。** 旧请求可以继续兼容，但通用二进制能力需要上传端、打包端与解码端共同升级。

## 3. 数据模型变更

### 3.1 变更清单

| 模型 | 字段 / 约束 | 设计 |
| --- | --- | --- |
| `FileAsset` | 新增模型 | 保存通用文件存储定位、完整性与上传者元数据 |
| `FileAsset` | `@@unique([uploadedById, sha256])` | 保证同一上传者的相同内容只有一条资产记录，处理并发去重 |
| `VirtualFiles.content` | String → String? | 内联文本及历史内联图片使用；资源引用时为 NULL |
| `VirtualFiles.assetId` | 新增 String? 外键与索引 | 指向 FileAsset.id，删除策略 Restrict |
| `VirtualFiles.asset` | 新增关系 | 读取资源元数据与定位内容 |
| `VirtualFiles` | 新增 CHECK | content 与 assetId 恰好一个非 NULL |
| `User` | 新增反向关系 | 关联资源上传者 |
| `Image` | 无变更 | 不加入通用资源关系，不新增 virtualFiles.imageId |
| `Problems / Projects / FileSystems / ImageBuild` | 无必需字段变更 | 仍通过虚拟文件表达题目资源 |

### 3.2 Prisma 设计片段

```prisma
model FileAsset {
  id           String   @id @default(cuid())
  storageKey   String   @unique
  sizeBytes    BigInt
  sha256       String
  mimeType     String   @default("application/octet-stream")
  uploadedById String
  createdAt    DateTime @default(now())

  uploadedBy   User           @relation(fields: [uploadedById], references: [id], onDelete: Restrict)
  virtualFiles VirtualFiles[]

  @@unique([uploadedById, sha256])
  @@map("file_assets")
}

model VirtualFiles {
  // 现有字段和关系省略
  content String?
  assetId String?
  asset   FileAsset? @relation(fields: [assetId], references: [id], onDelete: Restrict)

  @@index([assetId])
}

model User {
  // 现有字段和关系省略
  uploadedAssets FileAsset[]
}
```

SQL migration 补充 Prisma schema 无法直接表达的约束：

```sql
CHECK ((content IS NOT NULL) <> ("assetId" IS NOT NULL))
-- file_assets 表另加：
CHECK ("sizeBytes" >= 0)
```

字段约定：

- `storageKey` 是相对存储根目录的完整键，例如 `assets/<随机ID>.bin`，不保存绝对磁盘路径。需扩展当前 LocalStore 对键空间、精确读取和删除的支持，不能直接把含目录的键交给现有按 ID 扫描文件的实现。
- 不依赖扩展名存储；原文件名保留在 `VirtualFiles.path`。同一资产可由多个不同路径引用。
- `sha256`、`sizeBytes` 均根据原始字节计算，允许零字节文件；sha256 统一保存小写十六进制，由服务端计算，不信任客户端声明。以 uploadedById + sha256 建立联合唯一约束，不跨用户自动去重；联合索引也覆盖按上传者查询，无须另建单列上传者索引。
- `sizeBytes` 使用 BigInt，接口 DTO 转为十进制字符串；业务另设单文件及总上传限额，并非允许无限大文件。
- `mimeType` 是类型元数据；当前实现统一写入 `application/octet-stream`，不靠 MIME 决定传输编码。类型识别可后续增加。
- `uploadedById` 记录来源，不等于全部访问权限。用户克隆模板后，即使不是上传者，也应能通过自己的项目引用访问资源。
- FileAsset 内容不可原地覆盖，换内容时查找或创建对应资产并切换引用，避免影响历史版本和其他项目。无需可变内容字段、图片缩略图字段或缓存式 refCount。

### 3.3 合法数据与实体关系

| 场景 | path | content | assetId |
| --- | --- | --- | --- |
| 文本源码 | `/project/index.html` | `<html>...</html>` | NULL |
| 历史内联图片 | `/project/logo.png` | data URL 或旧裸 base64 | NULL |
| 新图片 | `/project/logo.png` | NULL | FileAsset ID |
| 音频 | `/project/audio/theme.mp3` | NULL | FileAsset ID |
| 字体 / WASM / 未知二进制 | 原工程路径 | NULL | FileAsset ID |
| 空文本文件 | 原工程路径 | 空字符串 | NULL |

```mermaid
erDiagram
  Problems ||--o{ Projects : contains
  Projects o|--o{ FileSystems : contains
  FileSystems o|--o{ VirtualFiles : contains
  VirtualFiles }o--o| FileAsset : references
  User ||--o{ FileAsset : uploads
  FileAsset {
    string id PK
    string storageKey UK
    bigint sizeBytes
    string sha256
    string mimeType
    string uploadedById FK
  }
  VirtualFiles {
    string path
    string content "nullable"
    string assetId FK "nullable"
  }
```

图中保留现有可空归属关系；每条 VirtualFiles 记录由 CHECK 保证内联与资源引用互斥。`Image` 不参与该关系。

## 4. 传输契约与兼容策略

### 4.1 保留原有 base64 字符串流

上传、参考答案审核和作答提交继续使用 `Record<string, string>`，无需强制引入快照 V2、对象联合类型或修改审核任务 payload 的字段结构。

```ts
const snapshot: Record<string, string> = {
  '/project/index.html': '<html>...</html>',
  '/project/audio/theme.mp3': 'data:application/octet-stream;base64,...',
  '/project/module.wasm': 'data:application/octet-stream;base64,...',
};
```

新采集的二进制统一用 `data:application/octet-stream;base64,<内容>` 表示；共享解码器也兼容其他 MIME 的 base64 data URL。这仍然是原有字符串快照中的 base64 流，前缀只负责显式说明编码，避免解码器需要凭扩展名猜测。

旧的裸 base64 图片保持兼容。如果新类型也使用裸 base64，则需同步扩展读取端的判定规则；任意二进制、未知扩展名场景优先使用上述 data URL，以免把普通文本误判为 base64。

上传端先读取原始字节；仅对严格 UTF-8 解码有效、可原样重编码、且符合文本策略的内容选择文本，其余按二进制保存。无法确定时按字节保留，支持显式选择二进制。不能先容错文本解码再试图恢复字节。含 NUL 等无法写入文本列的文件同样走 base64。

为兼容历史图片裸 base64，图片扩展名文件即使是合法文本也显式包装为二进制 data URL。QPC 仍会将图片扩展名文件内的合法 base64 data URL 文本还原为图片字节；普通路径下以 `data:` 开头的文本则包装后无损保留字面内容。

二进制内容在服务端严格校验后解码转储；参考答案和作答则继续以字符串快照经过审核任务及判题恢复。这里要求“贯穿链路”的是字节完整性，并非要求更换原有 base64 传输方式。

### 4.2 旧请求兼容

保留旧 `Record<string, string>` 输入及历史解析规则，继续支持既有图片的 data URL、裸 base64 和双层编码。它是一条有明确范围的兼容路径，不能据此承诺所有旧上传端都支持音频。

这里的兼容指历史数据与编码格式仍可读取，不代表必须继续允许旧版 QPC 发起新上传。新上传 / 重传需要满足 8.1 的最低版本要求。

**已经被旧客户端按文本解码而损坏的文件无法由服务端可靠修复，须从原文件重新上传。** 不对已有普通文本按音频扩展名盲目 base64 解码。

### 4.3 内部读取协议（设计目标）

```ts
type ProjectFileBody =
  | { kind: 'inline'; content: string }
  | { kind: 'asset'; assetId: string };

type ProjectSnapshot = Record<string, ProjectFileBody>;
```

以上联合模型是设计目标，当前 UI 尚未全部切换到该结构。现有项目读取由服务端将资产展开为 `data:application/octet-stream;base64,...`，再沿用字符串文件内容；内联数据走历史解码分支。WebContainer 将字节写回原路径，HTML / CSS / JS 内原有资源路径保持原样。

按项目读取资源的受保护 tRPC 接口为 `protected.problem.getProjectAsset({ projectId, assetId })`，返回 `{ content }`，其中 `content` 为 data URL；服务端校验用户对项目的归属和项目中的实际资源引用。当前没有新增 GET 原始字节流接口。

旧客户端读取兼容接口时，可将资源展开为通用 `data:<mime>;base64,...` 字符串；现有共享解码器已有 data URL 分支。但旧预览组件、文件同步及提交打包并不因此自动具备通用二进制支持，不能把此适配层视为完整兼容保证。

通用资源预览先提供文件名、大小和下载；图片、音频等按 MIME 提供对应预览。资源按需加载、媒体流式读取和 Range 支持可后置；资源上传、挂载与提交的字节正确性不能后置。

## 5. 写入一致性与资源生命周期

### 5.1 同一上传者范围内去重

典型收益来自同一作者反复上传题目版本、同一素材用于多题、或一个快照中不同路径包含同一文件。文件名、路径、扩展名及 base64 / data URL 的写法不参与去重，只有解码后的原始内容参与。同一用户把相同字节保存为不同路径时，这些路径仍各自存在，但指向同一资产。

1. 校验路径、编码、单文件与总大小，解码后计算 hash 和长度；原样保存字节，不压缩、转码或缩放。
2. 请求内先按 uploadedById + sha256 合并重复内容，再查询已存在的 FileAsset。命中时核对长度与文件存在性，准备复用其 ID；命中但长度不符或文件缺失时明确报错，不默默复用或覆盖共享资源。
3. 未命中的内容在数据库事务外写入本请求独占的随机 storageKey，记录所有候选文件，等待关系提交。不能仅凭“先查询未命中”认定自己是唯一上传者。
4. 在创建题目版本的同一数据库事务中，用 `INSERT ... ON CONFLICT ("uploadedById", sha256) DO NOTHING RETURNING id` 尝试创建资产。插入成功使用新 ID；冲突则查询已提交的获胜记录，复核元数据后复用其 ID。使用 PostgreSQL 默认 READ COMMITTED；若采用更严格隔离级别，则对序列化冲突重试整个事务。
5. 在该事务中写入题目版本、模板项目、VirtualFiles 及原有审核任务；所有引用使用最终选定的 ID，不能继续使用并发失败方的候选 ID。图片等引用文件为 content = NULL、assetId 非空。
6. 事务提交后删除本请求中未被采用的候选磁盘文件；事务失败则删除本请求独占的新文件。只清理本请求随机键，绝不删除预先命中或并发获胜方的共享文件。清理失败与崩溃残留通过带宽限期的孤立文件回收处理。

联合唯一约束是并发正确性的保障，应用层查询只是减少重复写盘。不要在 PostgreSQL 事务中直接捕获唯一键异常后继续执行 SQL；冲突分支应使用上述 ON CONFLICT，或回滚后重试完整事务。磁盘写入与数据库事务仍不是跨系统原子操作，并发过程中可能短暂产生多个候选文件，正常完成清理后只保留一份。

```mermaid
flowchart TD
  A[原始字节] --> H[服务端计算 SHA-256 和大小]
  H --> K[去重键：uploadedById + sha256]
  K --> Q{已有资产？}
  Q -->|有| R[校验后复用 assetId]
  Q -->|无| W[事务外写随机候选文件]
  W --> I{事务内插入<br/>联合唯一约束}
  I -->|成功| N[使用新 assetId]
  I -->|并发冲突| E[读取并复用获胜 assetId]
  R --> V[同一事务绑定虚拟文件引用]
  N --> V
  E --> V
  V --> C[提交后清理本请求未采用的候选文件]
```

`mimeType` 不是去重键：当前服务端统一保存 application/octet-stream，不因客户端换了 MIME 或文件名而新增副本。不同路径的展示名称来自 VirtualFiles。去重后既有资产内容和元数据不被新请求原地改写。

### 5.2 引用、权限与删除

克隆 / 重置复制引用，移动文件只改路径，删除文件仅释放引用，修改内容时执行同样的查找 / 创建流程。同一用户换回以前上传过的内容，也可以复用已有资产。

资源读取基于可访问项目中的实际引用授权，不能只凭知道 assetId 即访问，也不能只校验上传者。现有图片公共静态接口不直接作为通用文件访问策略。

首阶段不自动删除已入库资产。后续回收核对所有模板、历史版本和用户项目引用，再借助外键 Restrict 防止误删；磁盘清理由可重试任务完成。用户删除不能级联破坏其他项目共享资产。

去重查询只在服务端按已认证的上传者执行，不提供任意 hash 探测他人资产的接口。后续增加自动回收时，复用资产并创建引用与回收事务必须协调行锁 / 重试，防止查到的资产在绑定前被删除；本阶段不启用该并发删除链路。

## 6. 对原数据链路的侵入性图解

### 6.1 原链路

```mermaid
flowchart TD
  A[Web / CLI 文件采集<br/>主要按图片类型编码] --> B[上传 / 重传<br/>字符串快照]
  B --> C[(模板 VirtualFiles<br/>content 保存全部内容)]
  C --> D[克隆 / 重置<br/>复制 path 和 content]
  D --> E[(用户项目 VirtualFiles)]
  C --> F[编辑回填]
  E --> G[读取 / 预览 / 解码挂载]
  G --> H[文件同步]
  H --> E
  G -.按图片扩展名选择编码.-> I[作答打包]
  B -.参考答案字符串快照.-> Q[持久化审核任务]
  I --> J[判题调度器解码还原]
  Q --> J
```

### 6.2 通用资产方案

**橙色：必须修改；蓝色：新增；紫色：可后置；灰色：复用的结构或行为。** 上传和提交的二进制采集必须修正；审核任务与判题的字符串协议可以保持原样，复用已有 data URL 解码。

```mermaid
flowchart TD
  A[① Web / CLI 采集<br/>读取原字节并生成 base64 data URL] --> B[② 上传 / 重传<br/>沿用字符串快照并归一化]
  B --> S[③ 按上传者与 hash 去重<br/>未命中原样转储并处理并发补偿]
  S --> FS[(本地资产文件)]
  S --> DB[④ 数据库事务]
  DB --> FA[(新增 FileAsset<br/>存储键 / 大小 / hash / MIME)]
  DB --> V[(模板 VirtualFiles<br/>content 或 assetId)]
  V -.外键.-> FA
  V --> COPY[⑤ 克隆 / 重置<br/>复制 assetId 与 path]
  COPY --> U[(用户项目 VirtualFiles)]
  V --> R[⑥ 统一读取 / 回填<br/>内联解码或引用解析]
  U --> R
  FA --> R
  FS --> R
  R --> WC[⑦ 前端挂载<br/>按原路径写入字节]
  WC --> SYNC[⑧ 文件同步<br/>按编码切换内联 / 资产状态]
  SYNC --> U
  R --> PREVIEW[可后置：丰富预览<br/>媒体播放 / 按需加载]
  V --> CMP[⑨ 内容比较<br/>按原始字节 hash 比较]
  B --> CMP
  WC --> PACK[⑩ 作答打包<br/>通用二进制编码]
  PACK --> J[⑪ 判题恢复<br/>复用现有 data URL 解码]
  B -.参考答案 base64 字符串.-> Q[⑪ 原审核任务 payload<br/>沿用字符串快照]
  Q --> J
  J --> EXEC[原有执行与判题逻辑]

  classDef change fill:#fff0d9,stroke:#b76b00,color:#4a2b00;
  classDef added fill:#e5f2ff,stroke:#2471a3,color:#123c57;
  classDef later fill:#f2eaff,stroke:#8050ad,color:#402858;
  classDef stable fill:#f0f1f3,stroke:#737b85,color:#252a30;
  class A,B,DB,V,COPY,U,R,WC,SYNC,CMP,PACK change;
  class S,FS,FA added;
  class PREVIEW later;
  class J,Q,EXEC stable;
```

### 6.3 侵入点清单

| 位置 | 侵入程度 | 具体改造 / 遗漏后果 |
| --- | --- | --- |
| ① 上传端 | 中，新增类型必需 | Web walk-file-list.ts、CLI domain/snapshot.ts：替换图片限定规则；遗漏会在上传前损坏音频等文件 |
| ② 上传 / 重传 | 中 | admin/problem.ts：在原字符串 schema 下归一化内容并共用转储流程；无需强制修改上传字段类型 |
| ③ 存储服务 | 中，主要新增 | 精确 storageKey 读写、按上传者和 hash 去重、原样保存、并发候选文件补偿；不能复用会转换内容的图片上传服务 |
| ④ 数据模型 | 中，影响共用类型 | 新表、上传者与 hash 联合唯一约束、外键、可空 content、互斥约束、IFile 联合类型及序列化映射 |
| ⑤ 克隆 / 重置 | 低但必需 | project.ts 和 protected/problem.ts 显式 SQL 增加 assetId，否则复制后资源丢失 |
| ⑥ 读取 / 回填 | 中 | 双读、权限校验、引用解析、编辑回填与兼容接口，避免 NULL 被当文件内容 |
| ⑦ 挂载 | 中 | convert-to-fs-tree.ts 上游解析资产字节；图片之外同样以 Uint8Array 写入 |
| ⑧ 同步 | 中 | file-sync.ts 及客户端：支持通用编码，原子切换 content / assetId；仅移动保留引用 |
| ⑨ 内容比较 | 中 | isSameFiles 比较字节 hash；相同内容新 ID 不视为变化，不同资产 NULL 内容不视为相同 |
| ⑩ 作答打包 | 中，必需 | CommitModal.vue 及相关读取逻辑：替换图片扩展名列表，否则提交时再次损坏二进制 |
| ⑪ 审核 / 判题传输 | 低，以验证为主 | QualityAuditPayload 与任务字段结构不变，TempFileService 复用通用 data URL 解码；验证音频等字节完整性 |
| 展示增强 | 可后置 | 图片 / 音频预览、媒体 Range、资源懒加载；文件完整性不依赖这些功能 |
| 既有 Image 业务 | 无数据模型侵入 | 头像、封面、截图仍走原表；底层存储改动需验证兼容 |

**整体侵入性为中等：改动集中在资产存储、文件读写和采集打包。** 审核与判题继续使用原 base64 字符串流，不需要为支持通用资源强制重构其协议。

## 7. 审核任务与第二阶段边界

首阶段模板持久化使用资产引用；参考答案和作答的二进制内容仍通过原 base64 字符串流随任务传输。参考答案不会新增永久模板项目，但其内容仍可能保存在持久化任务 payload 中。

本方案不在任务 JSON 中存 assetId，因此首阶段不新增任务资产关系表。若后续要减少任务中的大字段，再增加任务与资产的真实外键关系，支持任务保活、重试及保留期；不能只在 JSON 中放 ID 后就允许清理资产。

## 8. 上线与历史兼容

### 8.1 提高 QPC 最低上传版本

QPC 1.2.2 对图片列表之外的文件使用 UTF-8 解码。本分支已将采集逻辑修复并将版本提升到 1.2.3，但该版本尚未发布。**必须先发布 1.2.3，再部署提高最低版本的服务端。**

现有门槛可直接复用：

- `packages/shared/service/cli-version.ts` 的 `MIN_CLI_VERSION` 已在本分支提高至 1.2.3。
- `server/trpc/middlewares/require-cli-version.ts` 已用于题目 upload / reupload，依据 `x-quanta-cli-version`，或从 User-Agent 兜底解析 CLI 版本；继续返回现有升级提示与 `CLI_VERSION_TOO_OLD` 错误。
- 部署配置 `NUXT_QUANTA_MIN_CLI_VERSION` 只能提高内置门槛；无效或较低的配置回退到内置值。
- Web 发布页不带 CLI 标识，不参与此版本校验；需同步部署修复后的 Web 文件采集与打包逻辑。现有中间件对无法识别 CLI 版本的请求也不拦截，版本头是兼容控制手段，不能替代内容校验或当作字节无损的证明。

先发布修复版 QPC，再提高服务端门槛，避免要求用户升级到尚未发布的版本。门槛针对新题上传和题目重传，不阻断历史题目读取与旧审核任务恢复。历史编码兼容与拒绝旧上传程序是两个独立要求。

### 8.2 发布与迁移顺序

1. 在独立临时库验证完整迁移及现有数据兼容性；备份真实库后，先应用数据库迁移，新增 FileAsset、可空 assetId 和约束；旧数据原样保留。
2. 完成端到端验证并发布修复版 QPC 1.2.3，确认用户可以安装该版本。
3. 部署已适配的服务端、Web 采集和作答打包代码，并部署兼容通用 data URL 的判题消费端。当前实现没有独立的引用写入开关：服务端部署后即会写入 FileAsset，因此部署前须完成数据库迁移和消费端兼容验证。
4. 验证最低版本门槛、资产转储及音频、字体等从上传到判题的字节完整性。
5. 按需迁移历史内联图片：解码后走相同去重入口，再条件更新 content / assetId，防止覆盖并发修改；纯存储迁移不触发内容版本变化。迁移以模板作者或用户项目所有者作为上传者范围，不把历史迁移任务执行者作为上传者。
6. 对已被旧文本读取流程损坏的非图片文件，明确要求原文件重新上传，不能伪造迁移成功。

上线后保留兼容版本，不直接回滚到只认识非空 content 的旧程序。若必须回滚，停止新写入，先展开全部资产为可兼容的内容表示，并确认旧程序能够处理这些文件类型；对新增通用二进制能力，旧程序可能没有可用的完整回滚路径。

## 9. 验收标准

- 图片、音频、视频、字体、WASM、未知扩展名二进制从原文件到存储、挂载、作答打包、判题恢复的 SHA-256 一致。
- 文本、空文件、历史裸 base64、data URL、双层编码和新资源引用可以混合存在。
- 不能 UTF-8 无损往返或含 NUL 的文件不会进入数据库文本列；非图片 MIME 和未知 MIME 不导致内容损坏。
- 克隆 / 重置保留引用；改资源不影响其他项目；删除引用不会删除共享资产。
- 旧图片上传与旧持久化任务仍可恢复，通用 base64 data URL 在各消费端得到一致处理。
- 可识别为低于最低版本的 QPC 上传 / 重传被拒绝并提示升级；修复版本正常上传。部署覆盖配置与默认门槛一致，Web 发布页及历史数据读取不被 CLI 版本门槛误拦截。
- 相同资源重新上传、历史存储迁移不触发无意义版本变化；实际换文件能被识别。
- 同一上传者相同字节在多路径、多题和重复上传中复用同一 assetId；不同上传者独立上传生成各自的资产，克隆现有项目仍可共享原引用。
- 同一上传者并发上传相同内容时，最终只产生一条资产记录，所有成功引用指向获胜记录；未采用的候选文件被清理。失败方不会删除其他请求已提交的文件。
- 去重命中但存储文件缺失或长度不符时明确失败；全部上传限额仍在去重前校验，不能借助已有资源绕过请求大小限制。
- 写文件成功但事务失败、资源缺失、越权引用、并发同步与非法双字段状态均有明确处理。
- 现有头像 / 封面 / 截图 Image 数据和接口保持可用。

**推荐实施：独立 FileAsset + VirtualFiles.assetId + 同一上传者范围内去重 + 原 base64 字符串流 + 历史双读。可后置的是丰富预览和任务资产化，不是音频等文件的无损采集与打包。**

## 10. 分支交付状态与后续事项

- 本分支包含 `20261217000000_file_assets` 迁移、通用快照编码、FileAsset 去重与引用、项目复制与同步适配，以及兼容展开 data URL 的读取路径。当前资产 MIME 固定为 `application/octet-stream`。
- 内部联合模型和丰富预览仍是后续工作；当前项目读取继续使用服务端展开后的字符串，项目资产 RPC 见 4.3。
- 候选文件清理失败会记录日志；后台定时清理超过宽限期且未被数据库引用的候选文件。已入库资产的生命周期回收和历史内联图片批量迁移不在本次交付范围。
- 迁移文件已编写，但尚未对真实数据库执行；QPC 1.2.3 仅为本分支版本号，尚未发布。部署前按 8.2 完成备份、隔离验证、发布与迁移，结合实际环境完成端到端验收。

以下是独立临时 PostgreSQL 库的验证命令模板，数据库应为空库或具有与目标环境一致的迁移历史；先确认连接指向专门创建的可丢弃数据库。不要对真实数据库运行此验证模板。完整历史迁移是否可在空库重放，及已有数据升级是否正确，均应在隔离环境分别验证。

```sh
export DATABASE_URL='postgresql://TEST_USER:TEST_PASSWORD@TEST_HOST:5432/DISPOSABLE_DATABASE'
pnpm --filter @challenge/database prisma:migrate:deploy
pnpm --filter @challenge/database prisma:generate
psql "$DATABASE_URL" -c '\d+ file_assets'
psql "$DATABASE_URL" -c '\d+ virtual_files'
```

验证时还应检查互斥 CHECK、外键和联合唯一约束，并使用隔离的文件存储目录运行资产去重、失败补偿、权限和字节哈希测试。不要仅凭迁移命令成功就视为完成端到端验收。

## 11. 本分支验收记录

2026-11-07，Terra 6.1 并行实现后，由主任务复核并验证：

- 全仓 `pnpm -r --no-bail typecheck` 通过；QPC lint、类型检查与构建通过。
- 完整数据库迁移在独立临时 PostgreSQL 实例重放成功，Prisma schema 校验通过；未迁移真实数据库。
- 两条资产集成测试脚本通过，覆盖并发去重、反序多文件绑定、跨用户隔离、事务补偿、数据库约束、权限、克隆、同步、重置、旧 revision 拦截和孤立候选文件清理。
- 上传路由验证 QPC 1.2.2 被拒绝且无副作用，1.2.3 正常转储；参考答案仍用 Base64 字符串；旧裸 Base64 与新 data URL 内容一致时，重传不新建题目版本或资产。
- QPC 编码测试、Web 文件操作与快照测试、真实判题文件恢复测试通过；覆盖音频、字体、WASM、未知扩展名、中文、BOM、字面 data URL 及历史图片，验证原始字节一致。既有判题质量审核的 15 项测试通过。
- Web `build:large` 及产物断言通过；普通构建触及默认约 2 GB 堆上限，使用仓库既有 6 GB 构建配置后完成。
- 生产产物在隔离数据库及 Redis 上启动成功。实际 HTTP 验证未登录读取返回 401、无关项目读取返回 404、合法项目引用读取返回与原音频字节一致的内容；临时服务已停止。
- 冻结锁文件安装及 `git diff --check` 通过。浏览器中的真实 WebContainer 启动与媒体播放未作实机验收，已验证其文件编解码与操作逻辑。

资产集成测试要求数据库位于 `127.0.0.1` 且名称固定为 `quanta_file_assets_test`。先专门创建空的临时数据库并执行迁移，再依次运行以下命令；替换端口和凭据为临时实例的实际值，不要指向真实数据库：

```sh
export DATABASE_URL='postgresql://TEST_USER:TEST_PASSWORD@127.0.0.1:TEST_PORT/quanta_file_assets_test'
export LOCAL_STORE_PATH="$(mktemp -d /tmp/quanta-file-assets-XXXXXX)"
export FILE_ASSETS_INTEGRATION_TEST=1
pnpm --filter @challenge/database prisma:migrate:deploy
pnpm --filter @challenge/database prisma:generate
pnpm --filter @challenge/app test:file-assets
pnpm --filter @challenge/app test:file-assets:upload
```
