import { defineProblemConfig } from '@challenge/problem-creator-cli';

// 出题配置。字段说明见 packages/problem-creator-cli/README.md
export default defineProblemConfig({
   title: '计数器：点击与状态联动',
   detail: [
      '## 题目要求',
      '',
      '用一两句话写清"学生要做什么"，以及判分关注的行为。',
      '',
      '- 点击 +1 按钮，当前计数加一',
      '- 计数达到 3 时显示"已达标"',
      '- 计数为 0 时重置按钮不可用',
      '',
      '## 提示',
      '',
      '题面支持 Markdown，会原样展示给学生。',
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
   },
   paths: {
      template: 'template',
      answer: 'answer',
      judge: 'judge.js',
   },
});
