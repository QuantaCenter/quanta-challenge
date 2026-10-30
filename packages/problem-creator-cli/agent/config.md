# 题目配置（problem.config.ts / problem.config.json）

查找顺序：`problem.config.ts` → `.mts` → `.js` → `.mjs` → `.json`。`.ts` 写法：

```ts
import { defineProblemConfig } from '@challenge/problem-creator-cli';
export default defineProblemConfig({ /* 字段如下 */ });
```

## 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 题目标题 |
| `type` | 否 | `frontend`（默认）\| `backend_service` |
| `detail` / `detailFile` | 二选一 | 题面 Markdown 正文 / 相对题目目录的 Markdown 文件 |
| `difficulty` | 是 | `easy` \| `medium` \| `hard` \| `very_hard` |
| `tagIds` | 是 | 平台标签 id 数组，至少一个（`qpc tag --write 2,5` 写入） |
| `snapshotImageId` | 视情况 | 启动命令用到的依赖已包含在某个快照镜像里时必填（填了做题页启动更快）。做题页挂载的快照镜像 id（`qpc snapshot-image --write <id>` 写入）；`null` = 明确不用；不写 = 新题不用、追加版本沿用平台上的值 |
| `totalScore` | 否 | 不写则取各检查点之和；写了必须相等（CFG001） |
| `problemId` | 否 | `qpc upload --write` 写回的 pid；有它时上传会追加新版本 |
| `cover` | 否 | `{ mode: 'default' }`（参考解首屏截图）或 `{ mode: 'custom', imageId, generate }` |
| `runtime.judgeUploadPath` | 否 | 默认 `project`：快照键前缀与站点根 |
| `runtime.initCommand` | 否 | 学生浏览器里（Vivari）的启动命令；前端默认静态服务器，后端默认 `cd ./project && npm start` |
| `runtime.buildCommand` | 否 | 后端题建议 `node -e ""` |
| `runtime.serviceImage` | 后端 | 目前只有 `node-24` |
| `runtime.servicePort` | 后端 | 服务端口，默认 3000 |
| `paths.template` / `paths.answer` / `paths.judge` | 否 | 默认 `template` / `answer` / `judge.js` |

## 最小可用 JSON 示例（前端）

```json
{
   "title": "计数器",
   "detailFile": "detail.md",
   "difficulty": "easy",
   "tagIds": [1],
   "cover": { "mode": "default" },
   "runtime": { "judgeUploadPath": "project", "initCommand": "npx -y serve@14.2.6 -l 3000 project" },
   "paths": { "template": "template", "answer": "answer", "judge": "judge.js" }
}
```

## 注意

- `initCommand` 跑在学生浏览器的 Vivari 里，**本地和 `qpc check` 都测不到**。不要随手改；必须改时一次只改一个参数，并在真实浏览器里确认预览能起来。判题用的不是它，而是判题容器里的静态服务器 / `npm start`。
- 站点根必须等于 `judgeUploadPath`（RUN001），否则页面 404、判题一直等选择器直到超时。
- 后端题的 `bootCommand` 由镜像决定，写了也会被覆盖（RUN002）。
- 上传新版本后它自动成为**当前版本**，只有当前版本能发布。
