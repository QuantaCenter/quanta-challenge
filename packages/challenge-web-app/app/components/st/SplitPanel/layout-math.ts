/**
 * SplitPanel 的纯计算部分。
 *
 * 单独抽出来是为了能被单测覆盖：面板比例"算错"的坑（分隔条占位没扣干净、
 * 自适应时把内容尺寸直接当成面板宽度）全部集中在这里，组件里只留 DOM 读写。
 */

/** 分隔条占位（rem）：`w-1` = 0.25rem，左右 `mx-1` 各 0.25rem，合计 0.75rem */
export const DIVIDER_REM = 0.75;

/** 分隔条占位（px）：与 DIVIDER_REM 等价（rem 基准按 16px 计算） */
export const DIVIDER_PX = 12;

/** 拖拽时两侧各自保留的最小比例（%） */
export const MIN_PANEL_PERCENT = 10;

/** 键盘微调步长（%）；按住 Shift 时用加速步长 */
export const KEYBOARD_STEP_PERCENT = 2;
export const KEYBOARD_STEP_FAST_PERCENT = 10;

export const clampPercent = (value: number, min = 0, max = 100) => {
   // NaN 没有可比性，直接退化为下界；±Infinity 交给 min/max 自然处理
   if (Number.isNaN(value)) return min;
   return Math.min(Math.max(value, min), max);
};

/**
 * 由 start 侧百分比推导两侧的 flex-basis。
 *
 * 关键约束：**start + end + 分隔条 = 100%**。
 * 旧实现把 end 写成 `calc(end% - .25rem)`，而分隔条实际占 0.75rem，
 * 于是每一行都会多出 0.5rem，把右侧面板挤出容器（表现为预览/终端被裁掉一条）。
 */
export const computeFlexBasis = (startPercent: number) => {
   const start = clampPercent(startPercent);
   return {
      start: `${start}%`,
      end: `calc(${100 - start}% - ${DIVIDER_REM}rem)`,
   };
};

/**
 * 拖拽位移 -> 新的 start 侧百分比。
 *
 * 越界（任一侧小于 minPercent）时返回 null，调用方应保持上一次的有效值，
 * 而不是把面板继续往外推。
 */
export const percentFromDrag = (options: {
   startSize: number;
   endSize: number;
   delta: number;
   minPercent?: number;
}) => {
   const { startSize, endSize, delta, minPercent = MIN_PANEL_PERCENT } = options;
   const total = startSize + endSize;
   if (!Number.isFinite(total) || total <= 0) return null;

   const next = ((startSize + delta) / total) * 100;
   if (next < minPercent || 100 - next < minPercent) return null;
   return next;
};

/**
 * "按内容自适应"：已知某一侧内容的像素尺寸，反推 start 侧百分比。
 *
 * 两侧的基准并不对称（end 侧还要再扣掉分隔条）：
 *   start 面板宽 = start% / 100 * C
 *   end   面板宽 = (100 - start)% / 100 * C - D
 * 因此：
 *   自适应 start 时：start = content / C * 100
 *   自适应 end   时：start = 100 - (content + D) / C * 100
 *
 * 早先的实现对两侧都套了 `content / C`，再各自减去/加上半个分隔条来"凑"，
 * 在 end 侧会算偏（终端折叠高度就是靠这个函数算出来的）。
 */
export const percentFromFit = (options: {
   place: 'start' | 'end';
   contentSize: number;
   containerSize: number;
   dividerPx?: number;
}) => {
   const { place, contentSize, containerSize, dividerPx = DIVIDER_PX } = options;
   if (!Number.isFinite(contentSize) || !Number.isFinite(containerSize)) {
      return null;
   }
   if (contentSize <= 0 || containerSize <= 0) return null;

   const ratio =
      ((contentSize + (place === 'end' ? dividerPx : 0)) / containerSize) * 100;

   return clampPercent(place === 'start' ? ratio : 100 - ratio);
};

/**
 * 方向键 -> start 侧百分比的增量；与该方向无关的按键返回 null。
 */
export const keyboardDelta = (
   axis: 'horizontal' | 'vertical',
   key: string,
   fast = false
) => {
   const map: Record<
      string,
      { axis: 'horizontal' | 'vertical'; sign: 1 | -1 }
   > = {
      ArrowLeft: { axis: 'horizontal', sign: -1 },
      ArrowRight: { axis: 'horizontal', sign: 1 },
      ArrowUp: { axis: 'vertical', sign: -1 },
      ArrowDown: { axis: 'vertical', sign: 1 },
   };

   const hit = map[key];
   if (!hit || hit.axis !== axis) return null;

   return hit.sign * (fast ? KEYBOARD_STEP_FAST_PERCENT : KEYBOARD_STEP_PERCENT);
};
