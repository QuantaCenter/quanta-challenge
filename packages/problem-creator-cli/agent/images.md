# 题面插图与封面

题面是 Markdown，图片必须是平台地址（`/api/static/<图片名>`）。本地路径上传后学生看不到，`qpc check` 会以 IMG003 拦下。

## 1. 生成：`qpc gen-img`

默认输出到题目目录的 `images/<name>.png`（动图为 `.gif`），不会进入学生工程。

```bash
# 流程图 / 请求链路 / 状态流转：每个参数一个步骤，步骤内用 \n 换行
qpc gen-img flow "用户点击 +1" "count += 1" "count >= 3 ?\n显示「已达标」" --name counter-flow --title "计数逻辑"
#   --direction lr|tb（默认超过 4 步纵向）  --theme light|dark

# 前端题：截取参考解效果图（与判题机同视口 1280×720）
qpc gen-img screenshot --target answer --name preview
qpc gen-img screenshot --selector ".card" --name card     # 只截某个元素
#   --viewport 375x667  --full-page  --wait 500

# 其它示意图（布局草图、坐标系、数据结构）：先手写 SVG，再转 PNG
qpc gen-img svg ./drafts/layout.svg --width 800

# 前端题：录制参考解动效为 GIF（加载动画、轮播等直接录；交互触发的写成步骤）
qpc gen-img record --duration 3000 --name loading
qpc gen-img record --selector ".card" --padding 24 --cursor --name card hover:.card wait:800
qpc gen-img record --cursor --name add-todo click:#new type:买牛奶 press:Enter
#   步骤：wait:<ms> click:<选择器> hover:<选择器> type:<文本> press:<按键> scroll:<像素|选择器>
#   --scale 2（高清屏清晰；1 体积更小）  --fps 15  --width 1600（上限）  --colors 256  --poster（另存最后一帧 PNG）

# 分步动画（算法过程、状态流转）：手写多帧 SVG / PNG，按顺序拼成 GIF
qpc gen-img frames drafts/step-01.svg drafts/step-02.svg drafts/step-03.svg --delay 800 --name bubble-sort
#   --hold 2000（最后一帧停留）  --width 640  --background "#ffffff"
```

录制 GIF 时：

- `type:` 输入到当前聚焦的元素，先 `click:` 输入框再 `type:`。
- `--cursor` 画出鼠标指针并平滑移动、显示点击涟漪；演示「点哪里」时建议加上。
- 不给 `--duration` 时录到最后一步结束后再 1 秒；总时长上限 15 秒。
- 只录关键区域（`--selector`）、控制宽度和时长，GIF 会小很多。超过 5MB 时自动依次降调色板、帧率、宽度并提示。
- 录制期间画面没变化会提示：多半是触发动效的交互没写成步骤。

手写 SVG 时：显式写 `width` / `height` / `viewBox`；中文字体用 `font-family="PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"`；背景画一个白色 `<rect>`，避免透明底在深色主题下看不清。

截图与录制需要无头浏览器（同本地微判题，缺失时会提示安装命令）。

## 2. 写进题面

命令输出里有现成的 Markdown 片段（路径相对题面文件）：

```md
![计数逻辑](images/counter-flow.png)
```

## 3. 上传并回写：`qpc image`

```bash
qpc image --write          # 上传题面里引用的全部本地图片，并把路径替换成 /api/static/<id>.png
qpc image images/a.png     # 只上传指定文件，打印可用的 Markdown
```

- 同一张图（按内容）不会重复上传：缓存在 `.qpc/images.json`，重跑是幂等的。
- 支持 png / jpg / jpeg / gif / webp / svg，单张 ≤ 5MB。
- 改了图片内容后重新 `gen-img`，题面里把地址改回本地路径，再 `qpc image --write` 即可。

## 4. 封面

- 前端题默认封面是**参考解首屏截图**（审核时生成）：首屏应好看且稳定，不要是空白、加载态、随机内容。
- 后端题**必须**自定义封面：

```bash
qpc cover --write                 # 按 cover.generate 渲染 cover.png → 上传 → 把 imageId 写回配置
qpc cover --random --write        # 随机一套可读配色
qpc cover --subtitle "GET /items · POST /items" --write
```
