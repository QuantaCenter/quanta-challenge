import './style.css';
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
