import type { LabTemplate } from './types';

export const echartsTemplate: LabTemplate = {
   id: 'echarts',
   name: 'ECharts 仪表盘',
   description: 'Apache ECharts 数据看板：折线、柱状、饼图与仪表盘联动示例。',
   category: 'chart',
   tags: ['ECharts', 'Vite', '图表'],
   icon: '/icons/echarts.svg',
   entry: 'src/charts.js',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: `# ECharts 仪表盘

使用 [Apache ECharts](https://echarts.apache.org/zh/index.html) 搭建的数据看板，包含四种常用图表：

| 图表 | 文件位置 | 说明 |
| --- | --- | --- |
| 折线图 | \`src/charts.js\` → \`createTrendChart\` | 近 12 个月访问量趋势 |
| 柱状图 | \`src/charts.js\` → \`createCategoryChart\` | 各题型提交量 |
| 饼图 | \`src/charts.js\` → \`createShareChart\` | 语言占比 |
| 仪表盘 | \`src/charts.js\` → \`createGaugeChart\` | 通过率 |

## 提示

- 示例数据在 \`src/data.js\`，点击页面右上角「随机数据」可以观察图表过渡动画
- 配置项手册：https://echarts.apache.org/zh/option.html
`,
   files: {
      'package.json': `{
  "name": "echarts-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "echarts": "^5.5.1"
  },
  "devDependencies": {
    "vite": "^5.4.11"
  }
}
`,
      'index.html': `<!doctype html>
<html lang="zh-CN">
   <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>ECharts 仪表盘</title>
   </head>
   <body>
      <header class="header">
         <div>
            <h1>数据看板</h1>
            <p>Apache ECharts · 示例数据</p>
         </div>
         <button id="shuffle" type="button">随机数据</button>
      </header>
      <main class="grid">
         <section class="panel panel-wide">
            <h2>访问趋势</h2>
            <div id="trend" class="chart"></div>
         </section>
         <section class="panel">
            <h2>通过率</h2>
            <div id="gauge" class="chart"></div>
         </section>
         <section class="panel">
            <h2>题型提交量</h2>
            <div id="category" class="chart"></div>
         </section>
         <section class="panel panel-wide">
            <h2>语言占比</h2>
            <div id="share" class="chart"></div>
         </section>
      </main>
      <script type="module" src="/src/main.js"></script>
   </body>
</html>
`,
      'src/main.js': `import './style.css';
import { createData } from './data.js';
import {
   createCategoryChart,
   createGaugeChart,
   createShareChart,
   createTrendChart,
} from './charts.js';

const charts = [
   createTrendChart(document.getElementById('trend')),
   createGaugeChart(document.getElementById('gauge')),
   createCategoryChart(document.getElementById('category')),
   createShareChart(document.getElementById('share')),
];

const render = () => {
   const data = createData();
   charts.forEach((chart) => chart.update(data));
};

render();
document.getElementById('shuffle').addEventListener('click', render);

// 容器尺寸变化时自适应
const observer = new ResizeObserver(() => charts.forEach((chart) => chart.resize()));
document.querySelectorAll('.chart').forEach((el) => observer.observe(el));
`,
      'src/data.js': `const random = (min, max) => Math.round(min + Math.random() * (max - min));

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1 + '月');
export const CATEGORIES = ['前端', '后端', '算法', '数据库', '运维'];
export const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust'];

export function createData() {
   return {
      visits: MONTHS.map(() => random(800, 3200)),
      submissions: MONTHS.map(() => random(300, 1800)),
      categories: CATEGORIES.map((name) => ({ name, value: random(120, 980) })),
      languages: LANGUAGES.map((name) => ({ name, value: random(80, 600) })),
      passRate: random(45, 96),
   };
}
`,
      'src/charts.js': `import * as echarts from 'echarts';
import { MONTHS } from './data.js';

const PALETTE = ['#FA7C0E', '#A6FB1D', '#14E87E', '#FFBE31', '#61DAFB', '#C084FC'];

const baseOption = {
   backgroundColor: 'transparent',
   color: PALETTE,
   textStyle: { color: '#CACACA' },
   tooltip: { backgroundColor: '#272727', borderColor: '#434343', textStyle: { color: '#E5E5E5' } },
};

function create(el, option, toOption) {
   const chart = echarts.init(el, 'dark');
   chart.setOption({ ...baseOption, ...option });
   return {
      update: (data) => chart.setOption(toOption(data)),
      resize: () => chart.resize(),
   };
}

const axisStyle = {
   axisLine: { lineStyle: { color: '#434343' } },
   splitLine: { lineStyle: { color: '#272727' } },
};

export function createTrendChart(el) {
   return create(
      el,
      {
         tooltip: { ...baseOption.tooltip, trigger: 'axis' },
         legend: { top: 0, textStyle: { color: '#9D9D9D' } },
         grid: { left: 40, right: 16, top: 40, bottom: 24 },
         xAxis: { type: 'category', data: MONTHS, boundaryGap: false, ...axisStyle },
         yAxis: { type: 'value', ...axisStyle },
         series: [
            {
               name: '访问量',
               type: 'line',
               smooth: true,
               areaStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                     { offset: 0, color: 'rgba(250, 124, 14, 0.45)' },
                     { offset: 1, color: 'rgba(250, 124, 14, 0)' },
                  ]),
               },
            },
            { name: '提交量', type: 'line', smooth: true },
         ],
      },
      (data) => ({ series: [{ data: data.visits }, { data: data.submissions }] }),
   );
}

export function createCategoryChart(el) {
   return create(
      el,
      {
         tooltip: { ...baseOption.tooltip, trigger: 'axis' },
         grid: { left: 40, right: 16, top: 16, bottom: 24 },
         xAxis: { type: 'category', ...axisStyle },
         yAxis: { type: 'value', ...axisStyle },
         series: [{ type: 'bar', barWidth: '45%', itemStyle: { borderRadius: [6, 6, 0, 0] } }],
      },
      (data) => ({
         xAxis: { data: data.categories.map((item) => item.name) },
         series: [{ data: data.categories.map((item) => item.value) }],
      }),
   );
}

export function createShareChart(el) {
   return create(
      el,
      {
         tooltip: { ...baseOption.tooltip, trigger: 'item' },
         legend: { orient: 'vertical', right: 16, top: 'middle', textStyle: { color: '#9D9D9D' } },
         series: [
            {
               type: 'pie',
               radius: ['45%', '72%'],
               center: ['40%', '50%'],
               itemStyle: { borderRadius: 8, borderColor: '#1F1F1F', borderWidth: 3 },
               label: { show: false },
            },
         ],
      },
      (data) => ({ series: [{ data: data.languages }] }),
   );
}

export function createGaugeChart(el) {
   return create(
      el,
      {
         series: [
            {
               type: 'gauge',
               progress: { show: true, width: 14, itemStyle: { color: '#A6FB1D' } },
               axisLine: { lineStyle: { width: 14, color: [[1, '#272727']] } },
               axisTick: { show: false },
               splitLine: { show: false },
               axisLabel: { show: false },
               pointer: { show: false },
               detail: { valueAnimation: true, formatter: '{value}%', color: '#E5E5E5', fontSize: 28, offsetCenter: [0, 0] },
            },
         ],
      },
      (data) => ({ series: [{ data: [{ value: data.passRate }] }] }),
   );
}
`,
      'src/style.css': `:root {
   color-scheme: dark;
   font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
   background: #111111;
   color: #e5e5e5;
}

body {
   margin: 0;
   padding: 1.5rem;
}

.header {
   display: flex;
   align-items: center;
   justify-content: space-between;
   margin-bottom: 1.25rem;
}

h1 {
   margin: 0;
   font-size: 1.5rem;
}

.header p {
   margin: 0.25rem 0 0;
   color: #6d6d6d;
   font-size: 0.85rem;
}

button {
   padding: 0.625rem 1.125rem;
   border: none;
   border-radius: 0.75rem;
   background: #fa7c0e;
   color: #fff;
   cursor: pointer;
}

.grid {
   display: grid;
   grid-template-columns: repeat(3, minmax(0, 1fr));
   gap: 1rem;
}

.panel {
   padding: 1rem;
   border-radius: 1rem;
   background: #1f1f1f;
   border: 1px solid #272727;
}

.panel-wide {
   grid-column: span 2;
}

h2 {
   margin: 0 0 0.5rem;
   font-size: 0.95rem;
   color: #cacaca;
}

.chart {
   height: 260px;
}

@media (max-width: 720px) {
   .grid {
      grid-template-columns: minmax(0, 1fr);
   }

   .panel-wide {
      grid-column: auto;
   }
}
`,
   },
};
