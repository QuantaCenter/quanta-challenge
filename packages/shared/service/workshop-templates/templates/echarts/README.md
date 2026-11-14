# ECharts 仪表盘

使用 [Apache ECharts](https://echarts.apache.org/zh/index.html) 搭建的数据看板，包含四种常用图表：

| 图表 | 文件位置 | 说明 |
| --- | --- | --- |
| 折线图 | `src/charts.js` → `createTrendChart` | 近 12 个月访问量趋势 |
| 柱状图 | `src/charts.js` → `createCategoryChart` | 各题型提交量 |
| 饼图 | `src/charts.js` → `createShareChart` | 语言占比 |
| 仪表盘 | `src/charts.js` → `createGaugeChart` | 通过率 |

## 提示

- 示例数据在 `src/data.js`，点击页面右上角「随机数据」可以观察图表过渡动画
- 配置项手册：https://echarts.apache.org/zh/option.html
