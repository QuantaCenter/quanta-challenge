import Chart from 'chart.js/auto';
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
