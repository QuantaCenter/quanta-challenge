# StCircularProgress

SVG 环形进度条。Nuxt 自动注册为 `StCircularProgress`，`percentage` 范围为 0–100。

```vue
<script setup lang="ts">
const progress = ref(35);
</script>

<template>
   <StCircularProgress
      :percentage="progress"
      :size="120"
      label-position="bottom"
      :duration="600"
      label="课程完成进度" />
</template>
```

修改 `progress` 时，圆环从当前位置平滑过渡到新进度。`animated=false` 立即更新；系统开启减少动态效果时关闭过渡。

## 参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `percentage` | 必填 | 进度百分比；超出范围会限制到 0–100，非有限数值按 0 处理 |
| `size` | `96` | 数字为 px，也接受 `8rem`、`10vw` 等 CSS 长度；使用百分比时需提供确定的父级尺寸 |
| `strokeWidth` | `8` | 100 × 100 viewBox 中的线宽，限制到 1–50，随组件尺寸等比例缩放 |
| `labelPosition` | `center` | `center`、`top`、`right`、`bottom`、`left` |
| `showPercentage` | `true` | 是否展示百分比或自定义标签 |
| `precision` | `0` | 百分比小数位，限制到 0–4 |
| `labelSize` | 中间 `18px`，外部 `14px` | 标签字号，数字为 px，也可传 CSS 长度 |
| `gap` | `8` | 外部标签与圆环的间距，数字为 px |
| `color` | 项目主色 | 进度颜色，接受 CSS 颜色或变量 |
| `trackColor` | `accent-500` | 轨道颜色 |
| `linecap` | `round` | `round`、`butt`、`square` |
| `startAngle` | `-90` | 起始角度；`-90` 从顶部开始，`0` 从右侧开始 |
| `clockwise` | `true` | 是否顺时针增长 |
| `animated` | `true` | 是否启用进度过渡 |
| `animateOnMount` | `false` | 首次挂载时是否从 0 过渡到当前进度 |
| `duration` | `500` | 动画时长，单位 ms |
| `label` | `进度` | 无障碍名称；组件提供 `progressbar` 语义及当前进度 |

## 自定义百分比内容

`label` 插槽接收规范化后的 `percentage` 与格式化后的 `text`。位置由 `labelPosition` 决定。

```vue
<template>
   <StCircularProgress
      :percentage="75"
      size="8rem"
      :stroke-width="6"
      label="课程完成进度">
      <template #label="{ text }">
         <span class="flex flex-col items-center">
            <span>{{ text }}</span>
            <span class="text-xs text-accent-300">已完成</span>
         </span>
      </template>
   </StCircularProgress>
</template>
```

若圆环尺寸很小，请同时调小 `labelSize` 或设置 `showPercentage=false`。百分比默认显示目标值，圆环负责进度过渡。
