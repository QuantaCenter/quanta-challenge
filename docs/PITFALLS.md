# 踩坑记录（Pitfalls）

> 这不是设计文档，而是**事故档案**：每条都写明「症状 → 根因 → 记住什么」。
> 目的只有一个：同一个坑不要踩第二遍。新坑请直接追加到对应分类末尾。
>
> 相关文档：[学习系统设计](./LEARNING_SYSTEM_DESIGN.md)、[题目创作指南](./PROBLEM_AUTHORING.md)、
> [质量基线](../.agent/QUALITY_BASELINE.md)。

## 一、前端状态与本地存储

### P1. 并发写入覆盖 → 「做完 A，B 的记录没了」

- **症状**：一篇文章引用两道题，做完第一道，第二道的"已完成"变回未完成；做完第二道，第一道又变回去。数据库里两条提交记录都在。
- **根因**：两处代码（提交成功流程、提交记录面板）各自在**挂载时**读一次本地记录，然后**异步**写回。谁最后写，就把对方那条一起覆盖了——典型的 lost update。
- **记住**：本地记录的写入纪律是 **「写入前重读权威内容再合并」**，绝不能拿内存里的旧快照整体覆盖。`load()` 也要合并而不是替换。
- **落点**：`app/composables/use-learning-visits.ts`；口径见设计文档 §17.10；回归测试 `app/utils/learning-visits.spec.ts`。

### P2. 读不到本地内容就回退种子 → 用户内容被抹掉

- **症状**：刚发布的文章刷新后消失。
- **根因**：`sync()` 在「localStorage 没有内容」时把内存状态换成了种子内容（`createSeedContent()`）。改存储键名（v1 → v2）+ HMR 重载正好触发了这条分支。
- **记住**：**种子内容永远不能是破坏性的**。读不到本地内容时只认版本号，什么都不改。
- **落点**：`app/composables/use-learning-store.ts`。

### P3. 改存储键名 = 清空用户数据

- **症状**：内容库版本升级后，用户自己创建的内容全没了。
- **根因**：只读新键 `...-v2`，旧键 `...-v1` 里的内容被当作不存在。
- **记住**：换键名必须**先读旧键做迁移**，或者干脆保留旧键兼容。

### P4. id 撞号 → 内容存在但"打不开"

- **症状**：新建的文章在列表里能看到，点进去找不到（或消失）。
- **根因**：`nextId()` 早期从 `SEED_ID_BASE = 100` 起算，与初始内容的 id 撞号；按 id 查找永远只命中一个，另一篇等于不存在。
- **记住**：`nextId` 取 `max(id) + 1`，下限从 0 起；并且 `pruneDanglingRefs` 要顺手丢掉撞号的重复记录。

### P5. 在 computed 里懒调 composable → 整页 500

- **症状**：`A composable that requires access to the Nuxt instance was called outside of ...`，页面整页 500。
- **根因**：进度计算函数（`articleProgress` / `topicProgress`）在 `computed` 里被调用，而它们内部又去调 `useState`（通过 store / visits composable）。首次执行不在 setup 里就炸。
- **记住**：**页面/组件在 setup 里取一次状态，按参数传进那些"纯读函数"**。它们不该自己拿运行时上下文。
- **落点**：`app/utils/learning-progress.ts`（纯模块）、`VisitSlice` / `LearningContentSlice` 两个显式参数。

### P6. 把规则写在依赖运行时的文件里 → 规则测不了

- **症状**：「只读了 2 篇里的 1 篇，专题却显示已读」这种规则 bug 只能靠用户发现。
- **根因**：规则原本写在 `composables/use-learning.ts`，该文件依赖 `use-learning-store`（`#imports`），vitest 一 import 就报 `Cannot find module '#imports'`，于是**一条测试也写不了**。
- **记住**：能被测试的规则要放进只依赖类型的**纯模块**（`app/utils/*.ts`）；需要运行时上下文的薄壳留在 composable。
- **落点**：`app/utils/learning-progress.ts` + `learning-progress.spec.ts`（10 条）。

### P7. `export { x } from '...'` 不建立本地绑定

- **症状**：拆分模块后相关页面全部 500，日志是 `topicProgress is not defined`。
- **根因**：`export { … } from '…'` 只对外转发，**不会在本模块建立本地绑定**；而 `useRecentLearning` 等函数在同一个文件内部还要调用这些进度函数。
- **记住**：既要对外导出、又要内部使用 → **先 `import`，再 `export`**。

### P8. 用脚本改文件前没备份 → 把 SFC 改坏

- **症状**：4 个做题页路由全部 500，Vite 报 `Element is missing end tag.`
- **根因**：一次 Python 字符串替换把 `<script setup lang="ts">` 开标签与 `</script>` 一起误删。
- **记住**：批量替换后立刻验证结构；定位 Vue 模板错误最快的办法是直接用 `@vue/compiler-sfc` 编译该文件并打印 `parse/compileTemplate` 的 `errors`（我这次就是这么找到的）。

### P9. Vue 3.5：具名插槽禁混写，# 简写禁动态

- **症状**：编译期报错（`useSlots` 混合写法 / 动态参数插槽）。
- **记住**：具名插槽**不要**混写 `v-slot:x` 和 `#x`；`#` 简写**不支持动态插槽名**（`#[name]`），要用 `v-slot:[name]`。

### P9b. 只产出类名、没有样式 → "设置了字号但发布后没变化"

- **症状**：编辑器里把文字设成大号，发布后字号不变；同一行的**加粗看起来正常**。
- **根因**：`<ArticleText size="lg">` 渲染成 `<span class="article-text-lg">`，而这三个类名
  （`article-text-sm/base/lg`）在项目里**根本没有 CSS 定义**——span 是个空壳。
  加粗是内联 `<strong>`，有浏览器默认样式，所以只有它生效。
  更隐蔽的是编辑器预览当时用的是**另一套**类名（Tailwind 原子类 `text-[1.25rem]`），
  于是"编辑器里正常、发布后失效"。
- **记住**：由代码拼出来的类名，必须有**同一个来源**与**真实样式**；两边各写一份必然漂移。
  这种缝用测试钉住：`app/utils/article-text-size.spec.ts` 断言
  「每个档位类名都在 `tailwind.css` 里有定义」+「渲染结果用的就是这套类名」。
- **落点**：`app/utils/inline-markdown.ts`（`ARTICLE_TEXT_SIZE_CLASS` 单一来源）、
  `app/assets/css/tailwind.css`（`.article-text-*`）、编辑器从同一处导入。

## 二、编号与地址（`pid` / `baseId` / id）

### P10. 把 `by-base` 当数字 → 所有题目链接判"题号有误"

- **症状**：文章里每道题点进去都显示「这道题已经不存在了 / 作者删除了这道题」，两道题全挂。
- **根因**：我加的「pid 必须是正整数」守卫放在 `by-base` 分支**之前**；`/challenge/editor/by-base/6` 的第二段是字符串 `by-base`，`Number('by-base')` = NaN → 被自己的守卫拦掉。
- **记住**：**分支顺序是有语义的**。地址解析统一走 `app/utils/problem-route.ts` 的 `resolveProblemRoute`，不要自己 `Number(path[1])`。
- **落点**：`app/utils/problem-route.ts` + `problem-route.spec.ts`（5 条，把这个顺序钉死）。

### P11. 提交后跳转用地址里的 pid → `/challenge/record/NaN`

- **症状**：提交成功跳到 `/challenge/record/NaN?id=24`，提交记录空白、超越率不显示。
- **根因**：`CommitModal` 自己从地址取第 2 段算 id（`by-base` → NaN），没用父级已经解析好的 pid。
- **记住**：组件需要 pid 时**由父级传入**，不要重复解析地址。同类问题还有侧栏「返回题目 / 提交记录」。

### P12. 除零 / 空数据 → 页面出现 `NaN`

- **症状**：右侧出现孤立的 `NaN`，标题是「超过 NaN% 的提交者」。
- **根因**：两个独立原因——`aheadRate = (total - rank - 1) / total` 没判 `total === 0`；排行榜区间为空时仍渲染坐标轴，`Math.min()` 对空数组返回 `Infinity`，`max - min` 得 NaN。
- **记住**：所有比率都要判分母；所有"聚合后再渲染"的组件都要有**空数据分支**。

### P13. 两套编号互相兜底 → 串题

- **症状**：解析不到题号时用 `pid: baseId` 兜底，结果 `baseId = 7` 写成 `pid = 7`，而 pid 7 是另一道题。
- **记住**：`pid` 与 `baseId` 是**两套编号**，不许互相赋值/兜底。解析不到就标 `unavailable`，真实 pid 只由服务端解析。

## 三、数据源切换（localStorage → 服务端）

### P14. 写死的 id 与新数据源不匹配 → 功能静默失效

- **症状**：「最近学习」永远为空；进度条上出现「0% + 打勾」；进度/完成度全世界一样。
- **根因**：这些派生值依赖写死的常量，而 id 是按旧数据源编的：
  - `ARTICLE_VISITS = { 101: '2026-10-08 09:12', … }`（第 n 篇 = 100 + n）；
  - `COMPLETED_BASE_IDS = { 7 }`（假装"主题切换做过了"）；
  - `COURSE_COMPLETIONS = { 5001: … }`。
  文章改成服务端后前端 id 是 cuid 的哈希，这些常量一条都匹配不上。
- **记住**：**从"写死的事实"切到"真实记录"时，把这些常量一起删掉**；改用稳定键（cuid / 题号）记录，并写回归测试。
- **落点**：进度已落库（表 `learning_visits` / `learning_completions`，接口 `public.learningProgress.*`），
  本地 `localStorage` 只剩兜底缓存 + 一次性迁移。口径见设计文档 §17.8。

### P14b. 本地记录不落库 → 换设备/清缓存就丢

- **症状**：换浏览器进度清零；也无法在服务端做任何统计。
- **根因**：访问 / 完成 / 做题记录都只写在 `localStorage` 里。
- **记住**：**私有进度必须落库**，但不能听客户端断言：完成是不可逆的记录，
  必须由服务端按权威事实重算后（题目是否真的都做过 / 文章是否真的都读过）才写；
  "做过哪道题"直接由成功提交记录推导，不要存第二份真源。
- **落点**：`server/trpc/services/learning-progress.ts`、`server/trpc/routes/public/learning-progress.ts`。

### P15. 分母与完成状态用了两套标准 → 「0% + 已完成」

- **症状**：专题卡片显示 0% 却打了勾。
- **根因**：`completed` 判定为「文章都读完了」，而百分比只看题目。
- **记住**：**完成度和百分比必须自洽**：没有题目（纯阅读）→ 用「已读 / 未读」；有题目 → 题目全做完才算完成。
- **口径**：设计文档 §17.9 / §17.11。

### P16. 用"打开过"表达"看过" → 读一篇就整篇专题已读

- **症状**：异步专题有 2 篇，只读了 1 篇，卡片就显示「已读」。
- **根因**：`read: isReadingOnly && lastOpenedAt !== null`，而 `lastOpenedAt` 把"专题下任意一篇被打开"都算进来了。
- **记住**：聚合的"已读"必须要求**全部**：专题 = 每篇文章都读过，课程 = 每个专题都已读。

### P17. 把"完成"当派生值现算 → 题目换版本后进度被抹掉

- **症状**：题目更新版本后，原本已完成的专题退回未完成。
- **根因**：完成状态每次渲染重新计算，分母变大就不满足了。
- **记住**：**完成不可逆**——达成的当下记一笔（键是 cuid），此后分母怎么变都保持完成；未完成时才重算。
- **口径**：设计文档 §17.9。

### P18. 已发布的 pid 会被换掉，链接里写死就点到作废版本

- **症状**：重新发布 / 切换当前版本后，文章里点题"一闪就黑"。
- **根因**：正文只写 `baseId`，但地址里用的是 `pid`；`reupload` 生成新 pid，`setCurrentProblem` 推进当前版本。
- **记住**：链接按**题号**写（`/challenge/editor/by-base/:baseId`），可用性与当前 pid **每次读取时实时解析**，不缓存进文章。
- **口径**：设计文档 §17.7。

### P19. 用内存版本号短路同步 → 新数据被旧版本挡住

- **症状**：「该题目不可用」闪一下又变回可用。
- **根因**：`hydrateFromServer` 比较 `version` 后提前 return，客户端这次的新数据被 SSR 那份的版本号挡掉了。
- **记住**：服务端是权威，**拿到就应用**；节流放在"什么时候去取"，不要放在"要不要用这次结果"。

## 四、判题与 CLI

### P20. 判题沙箱里 `export default` 的替换太宽松

- **症状**：审计得分 0，报 `'import' and 'export' may appear only with 'sourceType: module'`。
- **根因**：判题机用 `String.replace('export default ', …)` 替换模板注释里的同名字样，把注释也换掉了。
- **记住**：替换要锚定行首 → `/^[ \t]*export\s+default\s+/m`。
- **落点**：`packages/challenge-agents/judge-machine/src/services/judge.ts`。

### P21. `vm2` 沙箱里没有 `URL` 之类的宿主对象

- **症状**：判题脚本报 `URL is not defined`。
- **根因**：判题脚本跑在 `vm2` 里，宿主全局对象不全。
- **记住**：判题脚本里用**字符串解析**处理 URL，别依赖 `new URL()`。

### P22. Playwright 选择器里的引号是字面量

- **症状**：判题超时（`Judge Machine response timeout`）。
- **根因**：`input[name="keyboard"]` 在 Playwright CSS 引擎里引号会被当字面量，匹配不到元素，每次等满超时。
- **记住**：用 `input[name=keyboard]`；并且 `page.setDefaultTimeout(3000)` 别让一次失败吃满 30 秒。

### P23. 构建命令为空 → 判题跑不起来

- **症状**：题目上传后无法运行/判题。
- **根因**：`problem.config.ts` 没写 `buildCommand`。
- **记住**：脚手架与文档都要求显式写 `buildCommand: 'echo built'` 这类占位命令，别留空。

### P24. `--base` 重新上传到不存在的题号

- **症状**：`qpc upload … --base 10` 报 HTTP 500（Prisma `P2025`）。
- **根因**：base 10 不存在；`base_problems` 行没建成功，只留下一条 `status=invalid` 的 `problems` 记录。
- **记住**：`--base` 必须是**已存在的题号**；失败后先查库确认，再决定是重新上传还是换题号。

## 五、产品口径（容易反复）

- **只有课程需要审核**；文章与专题创建即可用（§17.1）。
- **文章是独立实体**：`/app/articles/:articleId` 不需要任何专题上下文（§17.6）。
- **有引用的东西不能删**：返回 409 并说明被谁引用，不做级联删除（§17.2）。
- **题目真不可用只有两种情况**：作者下架（`unpublished`）、题被删除或题号有误（`missing`）。**"被新版本取代"不是不可用**，要静默带到新版本（§17.9）。
- **页面不要放解释性文案**：需要说明时放在"为什么不能做"的位置上（如禁用按钮的提示），不要额外堆一段介绍。
