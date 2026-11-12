import * as echarts from 'echarts';
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
