import { defineProblemConfig } from '@challenge/problem-creator-cli';

// 出题配置。字段说明见 packages/problem-creator-cli/README.md
export default defineProblemConfig({
   title: '主题切换',
   detail: [
      '## 题目要求',
      '',
      '页面已经用 CSS 自定义属性（`--bg` / `--fg` / `--card` / `--accent`）画好了浅色主题，',
      '请给它加一个能在浅色 / 深色之间切换的开关。',
      '',
      '- 页面加载时默认是**浅色主题**：`html` 的 `data-theme="light"`，`--bg` 为 `#f6f7f9`',
      '- 点击 `#theme-toggle` 切到深色：`data-theme="dark"`，`--bg` 变成 `#10151c`，',
      '  同一时刻**卡片的实际背景色也要跟着变**（读 `getComputedStyle(.card).backgroundColor`）',
      '- 深色下再点一次回到浅色',
      '- 选择要能记住：切到深色后刷新页面，仍然是深色，且按钮文案回到「切到浅色」',
      '- 按钮文案跟随当前主题：浅色时是「切到深色」，深色时是「切到浅色」',
      '',
      '## 约定',
      '',
      '- 持久化的键固定用 `theme`，值只能是 `"light"` 或 `"dark"`',
      '- 不要在 HTML 里写死开关状态，切换必须由脚本完成',
      '- 判分选择器：`#theme-toggle`、`#theme-label`',
      '',
      '## 提示',
      '',
      '题面支持 Markdown，会原样展示给学生。',
   ].join('\n'),
   difficulty: 'medium',
   tagIds: [1],
   cover: { mode: 'default' },
   runtime: {
      // 判题打包目录，同时决定快照键前缀（/project/...）
      judgeUploadPath: 'project',
      initCommand: 'npx serve -l 3000 project',
      // 在线编辑器点「提交」时会先跑这条命令，退出码非 0 就直接判失败。
      // 本题是纯静态页面、没有构建步骤，所以给一条必定成功、且不碰文件的命令：
      // 留空的话编辑器侧 `!props.buildCommand` 会直接 return，提交流程根本不会开始。
      buildCommand: 'echo built',
   },
   paths: {
      template: 'template',
      answer: 'answer',
      judge: 'judge.js',
   },
});
