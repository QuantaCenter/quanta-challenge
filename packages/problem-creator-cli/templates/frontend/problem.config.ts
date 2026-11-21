import { defineProblemConfig } from '@challenge/problem-creator-cli';

// 出题配置。字段说明见 packages/problem-creator-cli/README.md
export default defineProblemConfig({
   title: '{{title}}',
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
   // 按题目总分选择难度，四档分数标准见 qpc agent config。
   difficulty: '{{difficulty}}',
   tagIds: [{{tagIds}}],
   // totalScore 留空时以检查点之和为准，填写则必须与之相等，否则审计失败（见 CFG001）。
   cover: { mode: 'default' },
   // 新题省略 designMode 时默认平铺。可设为 'flat'（平铺）、'hierarchical'（层级）或 null（不提供）。
   // designMode: null,
   // 后端题型需自定义封面：cover: { mode: 'custom', generate: { bg: '#0F172A', bgTo: '#14432A', subtitle: 'GET /health' } }，再跑 qpc cover --upload --write。
   runtime: {
      // 判题打包目录，同时决定快照键前缀（/project/...）
      judgeUploadPath: '{{mountPath}}',
      initCommand: '{{initCommand}}',
   },
   paths: {
      template: 'template',
      answer: 'answer',
      judge: 'judge.js',
   },
});
