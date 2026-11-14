import './style.css';
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
