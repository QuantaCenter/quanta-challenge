import type { LabTemplate } from './types';

export const chartjsTemplate: LabTemplate = {
   id: 'chartjs',
   name: 'Chart.js',
   description: '轻量的 Canvas 图表库：折线、柱状、环形与雷达图，配置简单直观。',
   category: 'chart',
   tags: ['Chart.js', 'Canvas', '图表'],
   icon: '/icons/chartjs.svg',
   entry: 'src/main.js',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: `# Chart.js

使用 [Chart.js](https://www.chartjs.org/) 绘制的四种常用图表：折线图、柱状图、环形图与雷达图。

## 目录

- \`src/main.js\`：图表创建与交互
- \`src/theme.js\`：暗色主题与调色板

## 提示

- 点击图例可以显示 / 隐藏对应的数据集
- 点击「随机数据」按钮观察 \`chart.update()\` 的过渡动画
`,
   files: {
      'package.json': `{
  "name": "chartjs-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "chart.js": "^4.4.7"
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
      <title>Chart.js Lab</title>
   </head>
   <body>
      <header class="header">
         <div>
            <h1>Chart.js 图表</h1>
            <p>点击图例切换数据集</p>
         </div>
         <button id="shuffle" type="button">随机数据</button>
      </header>
      <main class="grid">
         <section class="panel">
            <h2>每周活跃</h2>
            <div class="chart"><canvas id="line"></canvas></div>
         </section>
         <section class="panel">
            <h2>月度提交</h2>
            <div class="chart"><canvas id="bar"></canvas></div>
         </section>
         <section class="panel">
            <h2>难度分布</h2>
            <div class="chart"><canvas id="doughnut"></canvas></div>
         </section>
         <section class="panel">
            <h2>能力雷达</h2>
            <div class="chart"><canvas id="radar"></canvas></div>
         </section>
      </main>
      <script type="module" src="/src/main.js"></script>
   </body>
</html>
`,
      'src/theme.js': `import { Chart } from 'chart.js';

export const PALETTE = ['#FA7C0E', '#A6FB1D', '#61DAFB', '#FFBE31', '#C084FC', '#14E87E'];

export const withAlpha = (hex, alpha) => {
   const value = parseInt(hex.slice(1), 16);
   const r = (value >> 16) & 255;
   const g = (value >> 8) & 255;
   const b = value & 255;
   return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
};

export function applyDarkTheme() {
   Chart.defaults.color = '#9D9D9D';
   Chart.defaults.borderColor = '#272727';
   Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
   Chart.defaults.plugins.legend.labels.usePointStyle = true;
   Chart.defaults.plugins.tooltip.backgroundColor = '#272727';
   Chart.defaults.maintainAspectRatio = false;
}
`,
      'src/main.js': `import Chart from 'chart.js/auto';
import { PALETTE, applyDarkTheme, withAlpha } from './theme.js';
import './style.css';

applyDarkTheme();

const random = (min, max) => Math.round(min + Math.random() * (max - min));
const series = (length, min, max) => Array.from({ length }, () => random(min, max));

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月'];

const line = new Chart(document.getElementById('line'), {
   type: 'line',
   data: {
      labels: WEEK,
      datasets: [
         {
            label: '本周',
            data: series(7, 20, 100),
            borderColor: PALETTE[0],
            backgroundColor: withAlpha(PALETTE[0], 0.2),
            fill: true,
            tension: 0.4,
         },
         {
            label: '上周',
            data: series(7, 20, 100),
            borderColor: PALETTE[2],
            borderDash: [6, 6],
            tension: 0.4,
         },
      ],
   },
});

const bar = new Chart(document.getElementById('bar'), {
   type: 'bar',
   data: {
      labels: MONTHS,
      datasets: [
         { label: '通过', data: series(6, 50, 200), backgroundColor: PALETTE[1], borderRadius: 6 },
         { label: '未通过', data: series(6, 20, 120), backgroundColor: PALETTE[0], borderRadius: 6 },
      ],
   },
   options: { scales: { x: { stacked: true }, y: { stacked: true } } },
});

const doughnut = new Chart(document.getElementById('doughnut'), {
   type: 'doughnut',
   data: {
      labels: ['简单', '中等', '困难'],
      datasets: [{ data: series(3, 10, 60), backgroundColor: PALETTE.slice(1, 4), borderWidth: 0 }],
   },
   options: { cutout: '65%' },
});

const radar = new Chart(document.getElementById('radar'), {
   type: 'radar',
   data: {
      labels: ['HTML', 'CSS', 'JavaScript', '框架', '工程化', '算法'],
      datasets: [
         {
            label: '我',
            data: series(6, 40, 100),
            borderColor: PALETTE[0],
            backgroundColor: withAlpha(PALETTE[0], 0.25),
         },
      ],
   },
   options: {
      scales: {
         r: { angleLines: { color: '#272727' }, grid: { color: '#272727' }, ticks: { display: false } },
      },
   },
});

document.getElementById('shuffle').addEventListener('click', () => {
   line.data.datasets.forEach((dataset) => (dataset.data = series(7, 20, 100)));
   bar.data.datasets.forEach((dataset) => (dataset.data = series(6, 20, 200)));
   doughnut.data.datasets[0].data = series(3, 10, 60);
   radar.data.datasets[0].data = series(6, 40, 100);
   [line, bar, doughnut, radar].forEach((chart) => chart.update());
});
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
   grid-template-columns: repeat(2, minmax(0, 1fr));
   gap: 1rem;
}

.panel {
   padding: 1rem;
   border-radius: 1rem;
   background: #1f1f1f;
   border: 1px solid #272727;
}

h2 {
   margin: 0 0 0.75rem;
   font-size: 0.95rem;
   color: #cacaca;
}

.chart {
   position: relative;
   height: 240px;
}

@media (max-width: 720px) {
   .grid {
      grid-template-columns: minmax(0, 1fr);
   }
}
`,
   },
};
