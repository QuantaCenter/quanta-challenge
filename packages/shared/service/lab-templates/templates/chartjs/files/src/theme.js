import { Chart } from 'chart.js';

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
