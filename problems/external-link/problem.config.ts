import { defineProblemConfig } from '@challenge/problem-creator-cli';

// 出题配置。字段说明见 packages/problem-creator-cli/README.md
export default defineProblemConfig({
   title: '站外链接',
   detail: [
      '## 题目要求',
      '',
      '页面里有一个指向百度的链接，但点它打不开百度。',
      '**答案模板和参考解只差一行**：`<a>` 的 `href` 写法。',
      '',
      '- 页面里**只有一个链接**，文字是「去百度」',
      '- 它的 `href` 必须是**绝对地址**：带协议（`https://`），指向 `www.baidu.com`',
      '- 点它要真的跳转到百度',
      '',
      '## 提示',
      '',
      '`href="www.baidu.com"` 会被浏览器当成**相对路径**，解析成',
      '`http://<当前站点>/www.baidu.com` —— 也就是在本地找一个叫 `www.baidu.com` 的文件，',
      '当然找不到。补上协议之后才是外部地址。',
      '',
      '## 判分口径',
      '',
      '- 链接用语义化的 `<a href>`（用 `onclick` + `location.href` 不算）',
      '- `href` 解析后的绝对地址必须落在 `www.baidu.com`',
      '- 点击后地址要离开本地页面（判题机需要外网；拿不到外网时这条只提示，不扣分）',
   ].join('\n'),
   difficulty: 'easy',
   tagIds: [1],
   // totalScore 留空时以判题脚本里各检查点分值之和为准；
   // 填写则必须与之相等，否则审计会失败（见 qpc check 的 CFG001）。
   cover: { mode: 'default' },
   runtime: {
      // 判题打包目录，同时决定快照键前缀（/project/...）
      judgeUploadPath: 'project',
      initCommand: 'npx serve -l 3000 project',
      // 在线编辑器点「提交」时会先跑这条命令，退出码非 0 即失败。
      // 没有构建步骤的静态题也要给一条，否则编辑器里点提交不会有任何反应（RUN002）。
      buildCommand: 'echo built',
   },
   paths: {
      template: 'template',
      answer: 'answer',
      judge: 'judge.js',
   },
});
