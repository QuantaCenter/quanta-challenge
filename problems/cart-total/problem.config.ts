import { defineProblemConfig } from '@challenge/problem-creator-cli';

// 出题配置。字段说明见 packages/problem-creator-cli/README.md
export default defineProblemConfig({
   title: '购物车合计',
   detail: [
      '## 题目要求',
      '',
      '页面已经给出三件商品的单价与数量输入框，请把它接成一个能算账的购物车。',
      '',
      '- 每行的**小计** = 单价 × 数量，数量变化时立刻重算',
      '- 页脚的**合计** = 各小计之和，金额一律保留两位小数（`24.50` 而不是 `24.5`）',
      '- 合计达到 **100.00** 元时显示「已满 100 元，可享 9 折」，没达到时该提示为空',
      '- 数量输入框允许 1–9；只要购物车里有商品（数量 ≥ 1），「结算」按钮就可点，点击后提示「结算成功」',
      '',
      '## 约定',
      '',
      '- 金额直接相加即可，本题数据不会产生浮点误差',
      '- 判分选择器：`#subtotal-<name>`（`keyboard` / `mouse` / `cable`）、`#total`、`#discount-tip`、',
      '  `#checkout`、`#checkout-tip`',
      '- 数量输入框的 `name` 与商品的 `name` 一致，判分靠 `input[name="keyboard"]` 定位',
      '',
      '## 提示',
      '',
      '题面支持 Markdown，会原样展示给学生。',
   ].join('\n'),
   difficulty: 'easy',
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
