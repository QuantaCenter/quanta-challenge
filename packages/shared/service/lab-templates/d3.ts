import type { LabTemplate } from './types';

export const d3Template: LabTemplate = {
   id: 'd3',
   name: 'D3.js',
   description: '数据驱动的 SVG 可视化：可排序柱状图与力导向关系图。',
   category: 'chart',
   tags: ['D3', 'SVG', '图表'],
   icon: '/icons/d3.svg',
   entry: 'src/bar-chart.js',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: `# D3.js

[D3](https://d3js.org/) 是一个底层的数据可视化库，通过数据绑定直接操作 SVG。

## 示例

- \`src/bar-chart.js\`：可排序柱状图，演示比例尺、坐标轴、数据连接（join）与过渡动画
- \`src/force-graph.js\`：力导向关系图，节点可拖拽

## 提示

- 点击「排序」「随机数据」按钮观察 \`transition()\` 动画
- 修改 \`src/data.js\` 中的数据后保存即可看到效果
`,
   files: {
      'package.json': `{
  "name": "d3-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "d3": "^7.9.0"
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
      <title>D3.js Lab</title>
   </head>
   <body>
      <main class="grid">
         <section class="panel">
            <header>
               <h2>编程语言热度</h2>
               <div class="actions">
                  <button id="sort" type="button">排序</button>
                  <button id="shuffle" type="button" class="ghost">随机数据</button>
               </div>
            </header>
            <div id="bar-chart" class="chart"></div>
         </section>
         <section class="panel">
            <header>
               <h2>知识点关系图</h2>
               <span class="hint">拖拽节点试试</span>
            </header>
            <div id="force-graph" class="chart"></div>
         </section>
      </main>
      <div id="tooltip" class="tooltip"></div>
      <script type="module" src="/src/main.js"></script>
   </body>
</html>
`,
      'src/main.js': `import './style.css';
import { createBarChart } from './bar-chart.js';
import { createForceGraph } from './force-graph.js';
import { LANGUAGES, GRAPH, shuffleValues } from './data.js';

const barChart = createBarChart(document.getElementById('bar-chart'));
let data = LANGUAGES;
let sorted = false;

const render = () => {
   const items = sorted ? [...data].sort((a, b) => b.value - a.value) : data;
   barChart.update(items);
};

document.getElementById('sort').addEventListener('click', (event) => {
   sorted = !sorted;
   event.currentTarget.textContent = sorted ? '取消排序' : '排序';
   render();
});

document.getElementById('shuffle').addEventListener('click', () => {
   data = shuffleValues(data);
   render();
});

render();
createForceGraph(document.getElementById('force-graph'), GRAPH);
`,
      'src/data.js': `export const LANGUAGES = [
   { name: 'JavaScript', value: 92 },
   { name: 'Python', value: 88 },
   { name: 'TypeScript', value: 76 },
   { name: 'Java', value: 64 },
   { name: 'Go', value: 52 },
   { name: 'Rust', value: 41 },
   { name: 'C++', value: 58 },
   { name: 'Kotlin', value: 33 },
];

export const shuffleValues = (items) =>
   items.map((item) => ({ ...item, value: Math.round(20 + Math.random() * 80) }));

export const GRAPH = {
   nodes: [
      { id: 'Web', group: 0 },
      { id: 'HTML', group: 1 },
      { id: 'CSS', group: 1 },
      { id: 'JavaScript', group: 1 },
      { id: 'Vue', group: 2 },
      { id: 'React', group: 2 },
      { id: 'Vite', group: 3 },
      { id: 'Node.js', group: 3 },
      { id: 'TypeScript', group: 2 },
      { id: 'D3', group: 2 },
   ],
   links: [
      { source: 'Web', target: 'HTML' },
      { source: 'Web', target: 'CSS' },
      { source: 'Web', target: 'JavaScript' },
      { source: 'JavaScript', target: 'Vue' },
      { source: 'JavaScript', target: 'React' },
      { source: 'JavaScript', target: 'TypeScript' },
      { source: 'JavaScript', target: 'D3' },
      { source: 'JavaScript', target: 'Node.js' },
      { source: 'Node.js', target: 'Vite' },
      { source: 'Vite', target: 'Vue' },
      { source: 'Vite', target: 'React' },
   ],
};
`,
      'src/bar-chart.js': `import * as d3 from 'd3';

const MARGIN = { top: 16, right: 16, bottom: 32, left: 40 };
const HEIGHT = 300;

export function createBarChart(container) {
   const width = container.clientWidth || 480;
   const innerWidth = width - MARGIN.left - MARGIN.right;
   const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

   const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', [0, 0, width, HEIGHT])
      .attr('width', '100%');

   const root = svg.append('g').attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');
   const xAxis = root.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + innerHeight + ')');
   const yAxis = root.append('g').attr('class', 'axis');
   const bars = root.append('g');

   const x = d3.scaleBand().range([0, innerWidth]).padding(0.25);
   const y = d3.scaleLinear().range([innerHeight, 0]);
   const color = d3.scaleSequential([20, 100], d3.interpolateRgb('#434343', '#FA7C0E'));
   const tooltip = d3.select('#tooltip');

   function update(data) {
      const t = svg.transition().duration(750);
      x.domain(data.map((d) => d.name));
      y.domain([0, 100]);

      xAxis.transition(t).call(d3.axisBottom(x).tickSizeOuter(0));
      yAxis.transition(t).call(d3.axisLeft(y).ticks(5));

      bars
         .selectAll('rect')
         .data(data, (d) => d.name)
         .join(
            (enter) =>
               enter
                  .append('rect')
                  .attr('rx', 6)
                  .attr('x', (d) => x(d.name))
                  .attr('y', innerHeight)
                  .attr('height', 0)
                  .attr('width', x.bandwidth()),
            (update) => update,
            (exit) => exit.remove(),
         )
         .on('mousemove', (event, d) => {
            tooltip
               .style('opacity', 1)
               .style('left', event.pageX + 12 + 'px')
               .style('top', event.pageY - 12 + 'px')
               .text(d.name + '：' + d.value);
         })
         .on('mouseleave', () => tooltip.style('opacity', 0))
         .transition(t)
         .attr('x', (d) => x(d.name))
         .attr('width', x.bandwidth())
         .attr('y', (d) => y(d.value))
         .attr('height', (d) => innerHeight - y(d.value))
         .attr('fill', (d) => color(d.value));
   }

   return { update };
}
`,
      'src/force-graph.js': `import * as d3 from 'd3';

const HEIGHT = 300;
const COLORS = ['#FA7C0E', '#A6FB1D', '#61DAFB', '#C084FC'];

export function createForceGraph(container, graph) {
   const width = container.clientWidth || 480;
   const nodes = graph.nodes.map((d) => ({ ...d }));
   const links = graph.links.map((d) => ({ ...d }));

   const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', [0, 0, width, HEIGHT])
      .attr('width', '100%');

   const simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, HEIGHT / 2))
      .force('collide', d3.forceCollide(28));

   const link = svg
      .append('g')
      .attr('stroke', '#434343')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1.5);

   const node = svg
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .call(
         d3
            .drag()
            .on('start', (event, d) => {
               if (!event.active) simulation.alphaTarget(0.3).restart();
               d.fx = d.x;
               d.fy = d.y;
            })
            .on('drag', (event, d) => {
               d.fx = event.x;
               d.fy = event.y;
            })
            .on('end', (event, d) => {
               if (!event.active) simulation.alphaTarget(0);
               d.fx = null;
               d.fy = null;
            }),
      );

   node
      .append('circle')
      .attr('r', (d) => (d.group === 0 ? 14 : 9))
      .attr('fill', (d) => COLORS[d.group % COLORS.length]);

   node
      .append('text')
      .text((d) => d.id)
      .attr('x', 14)
      .attr('y', 4);

   simulation.on('tick', () => {
      link
         .attr('x1', (d) => d.source.x)
         .attr('y1', (d) => d.source.y)
         .attr('x2', (d) => d.target.x)
         .attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => 'translate(' + d.x + ',' + d.y + ')');
   });
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

.panel header {
   display: flex;
   align-items: center;
   justify-content: space-between;
   margin-bottom: 0.75rem;
}

h2 {
   margin: 0;
   font-size: 0.95rem;
   color: #cacaca;
}

.actions {
   display: flex;
   gap: 0.5rem;
}

button {
   padding: 0.5rem 0.875rem;
   border: none;
   border-radius: 0.625rem;
   background: #fa7c0e;
   color: #fff;
   cursor: pointer;
}

button.ghost {
   background: #272727;
   color: #cacaca;
}

.hint {
   color: #6d6d6d;
   font-size: 0.8rem;
}

.axis text {
   fill: #9d9d9d;
}

.axis path,
.axis line {
   stroke: #434343;
}

.node {
   cursor: grab;
}

.node text {
   fill: #cacaca;
   font-size: 12px;
   pointer-events: none;
}

.tooltip {
   position: absolute;
   padding: 0.375rem 0.625rem;
   border-radius: 0.5rem;
   background: #272727;
   color: #e5e5e5;
   font-size: 0.8rem;
   pointer-events: none;
   opacity: 0;
   transition: opacity 0.15s ease;
}

@media (max-width: 720px) {
   .grid {
      grid-template-columns: minmax(0, 1fr);
   }
}
`,
   },
};
