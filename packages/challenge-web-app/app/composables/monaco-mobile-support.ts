import type { IDisposable, editor } from 'monaco-editor';

/** 粗指针（触屏）设备检测；SSR 环境下恒为 false。 */
export const isTouchDevice = () => {
   if (typeof window === 'undefined') return false;
   return (
      window.matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window
   );
};

/** 触屏设备下的默认字号。 */
export const MOBILE_DEFAULT_FONT_SIZE = 13;

/** 触屏设备下追加的编辑器默认选项。 */
export const getMobileEditorOptions =
   (): editor.IStandaloneEditorConstructionOptions => ({
      fontSize: MOBILE_DEFAULT_FONT_SIZE,
      lineNumbersMinChars: 2,
      glyphMargin: false,
      lineDecorationsWidth: 0,
      scrollbar: {
         verticalScrollbarSize: 14,
         horizontalScrollbarSize: 14,
      },
      hover: { enabled: false },
   });

interface IApplyMobileTouchSupportOptions {
   /** 手指位移超过该值（px）判定为滚动而非点击 */
   tapSlop?: number;
}

/**
 * Monaco 触屏 hack：补齐移动端缺失的触摸能力。
 * - 点按仅定位光标并聚焦（唤起软键盘），不产生选区；
 * - 拖动滚动（带惯性）；
 * - 滚动条触摸拖拽。
 *
 * touch 事件会 stopPropagation 阻断 Monaco 全局 Gesture 识别器（监听 document）。
 *
 * @returns 可销毁句柄，会还原监听与样式。
 */
export const applyMobileTouchSupport = (
   instance: editor.IStandaloneCodeEditor,
   options?: IApplyMobileTouchSupportOptions
): IDisposable => {
   const domNode = instance.getDomNode();
   if (!domNode) return { dispose: () => void 0 };

   const { tapSlop = 12 } = options ?? {};

   const disposables: IDisposable[] = [];
   const addListener = <T extends Event>(
      target: HTMLElement,
      type: string,
      handler: (event: T) => void,
      listenerOptions?: AddEventListenerOptions
   ) => {
      target.addEventListener(
         type,
         handler as EventListener,
         listenerOptions
      );
      disposables.push({
         dispose: () =>
            target.removeEventListener(
               type,
               handler as EventListener,
               listenerOptions
            ),
      });
   };

   domNode.style.setProperty('-webkit-touch-callout', 'none');
   domNode.style.setProperty('user-select', 'none');
   // 触摸行为全部由本模块接管
   domNode.style.setProperty('touch-action', 'none');
   disposables.push({
      dispose: () => {
         domNode.style.removeProperty('-webkit-touch-callout');
         domNode.style.removeProperty('user-select');
         domNode.style.removeProperty('touch-action');
      },
   });

   let start: { x: number; y: number } | null = null;
   let last = { x: 0, y: 0 };
   let startTime = 0;
   let isMoved = false;

   /** 命中编辑器自身浮层（建议框 / 右键菜单）时不劫持手势 */
   const isGestureReserved = (target: EventTarget | null) =>
      !!(
         target instanceof HTMLElement &&
         target.closest('.suggest-widget, .monaco-hover, .context-view')
      );

   const positionAt = (x: number, y: number) => {
      const target = instance.getTargetAtClientPoint(x, y);
      if (!target) return null;
      // 无 position 时取 range 起点兜底
      if (target.position) return target.position;
      return target.range
         ? {
              lineNumber: target.range.startLineNumber,
              column: target.range.startColumn,
           }
         : null;
   };

   // ---------- 惯性滚动 ----------
   /** 松手后的滚动速度（px/ms） */
   let velocity = { x: 0, y: 0 };
   let lastMoveAt = 0;
   let momentumFrame: number | null = null;

   const stopMomentum = () => {
      if (momentumFrame !== null) {
         cancelAnimationFrame(momentumFrame);
         momentumFrame = null;
      }
      velocity = { x: 0, y: 0 };
   };

   /** 按当前速度启动惯性滚动 */
   const startMomentum = () => {
      if (momentumFrame !== null) {
         cancelAnimationFrame(momentumFrame);
         momentumFrame = null;
      }
      if (performance.now() - lastMoveAt > 100) return;
      const maxVelocity = 3;
      velocity.x = Math.max(
         -maxVelocity,
         Math.min(maxVelocity, velocity.x)
      );
      velocity.y = Math.max(
         -maxVelocity,
         Math.min(maxVelocity, velocity.y)
      );
      if (Math.abs(velocity.x) < 0.1 && Math.abs(velocity.y) < 0.1) return;

      let prevTime = performance.now();
      const step = (now: number) => {
         const dt = Math.min(now - prevTime, 64);
         prevTime = now;

         // 每 16ms 衰减 4%，模拟摩擦
         const decay = Math.pow(0.96, dt / 16);
         velocity.x *= decay;
         velocity.y *= decay;

         const prevTop = instance.getScrollTop();
         const prevLeft = instance.getScrollLeft();
         // 取 -velocity 与拖动滚动方向一致（内容跟随手指）
         instance.setScrollTop(prevTop - velocity.y * dt);
         instance.setScrollLeft(prevLeft - velocity.x * dt);
         if (instance.getScrollTop() === prevTop) velocity.y = 0;
         if (instance.getScrollLeft() === prevLeft) velocity.x = 0;

         if (
            Math.abs(velocity.x) < 0.01 &&
            Math.abs(velocity.y) < 0.01
         ) {
            momentumFrame = null;
            return;
         }
         momentumFrame = requestAnimationFrame(step);
      };
      momentumFrame = requestAnimationFrame(step);
   };

   // ---------- 滚动条拖拽 ----------
   /** Monaco 滚动条触摸拖动：自行换算轨道位置 */
   interface IScrollbarDrag {
      isVertical: boolean;
      /** 轨道起点（top 或 left） */
      trackPos: number;
      /** thumb 可滑动距离 */
      dragRange: number;
      /** 最大可滚动距离 */
      maxScroll: number;
      /** 手指相对 thumb 顶端的抓取偏移 */
      grabOffset: number;
   }
   let scrollbarDrag: IScrollbarDrag | null = null;

   const getScrollbarEl = (target: EventTarget | null) =>
      target instanceof HTMLElement
         ? target.closest<HTMLElement>(
              '.scrollbar.vertical, .scrollbar.horizontal'
           )
         : null;

   const beginScrollbarDrag = (scrollbarEl: HTMLElement, touch: Touch) => {
      const isVertical = scrollbarEl.classList.contains('vertical');
      const scrollbarRect = scrollbarEl.getBoundingClientRect();
      const sliderEl = scrollbarEl.querySelector<HTMLElement>('.slider');
      const sliderRect = sliderEl?.getBoundingClientRect();
      const layout = instance.getLayoutInfo();

      const trackPos = isVertical ? scrollbarRect.top : scrollbarRect.left;
      const trackLength = isVertical
         ? scrollbarRect.height
         : scrollbarRect.width;
      const sliderLength = isVertical
         ? (sliderRect?.height ?? 0)
         : (sliderRect?.width ?? 0);
      const dragRange = Math.max(1, trackLength - sliderLength);
      const maxScroll = isVertical
         ? Math.max(0, instance.getScrollHeight() - layout.height)
         : Math.max(0, instance.getScrollWidth() - layout.width);
      const touchPos = isVertical ? touch.clientY : touch.clientX;
      const sliderPos = isVertical ? sliderRect?.top : sliderRect?.left;
      const onSlider =
         sliderPos !== undefined &&
         touchPos >= sliderPos &&
         touchPos <= sliderPos + sliderLength;

      let grabOffset = sliderLength / 2;
      if (onSlider) {
         grabOffset = touchPos - (sliderPos as number);
      } else if (maxScroll > 0) {
         // 点在轨道空白处：thumb 中心跳到点击位置
         const progress =
            (touchPos - trackPos - sliderLength / 2) / dragRange;
         const scroll = Math.max(0, Math.min(1, progress)) * maxScroll;
         if (isVertical) {
            instance.setScrollTop(scroll);
         } else {
            instance.setScrollLeft(scroll);
         }
      }

      scrollbarDrag = { isVertical, trackPos, dragRange, maxScroll, grabOffset };
   };

   const updateScrollbarDrag = (touch: Touch) => {
      if (!scrollbarDrag) return;
      const { isVertical, trackPos, dragRange, maxScroll, grabOffset } =
         scrollbarDrag;
      const touchPos = isVertical ? touch.clientY : touch.clientX;
      const progress = (touchPos - trackPos - grabOffset) / dragRange;
      const scroll = Math.max(0, Math.min(1, progress)) * maxScroll;
      if (isVertical) {
         instance.setScrollTop(scroll);
      } else {
         instance.setScrollLeft(scroll);
      }
   };

   addListener(
      domNode,
      'touchstart',
      (event: TouchEvent) => {
         if (event.touches.length !== 1) {
            start = null;
            return;
         }
         const touch = event.touches[0]!;

         const scrollbarEl = getScrollbarEl(event.target);
         if (scrollbarEl) {
            event.stopPropagation();
            stopMomentum();
            beginScrollbarDrag(scrollbarEl, touch);
            return;
         }

         if (isGestureReserved(event.target)) return;
         // 阻断事件到达 Monaco 全局 Gesture 识别器（监听 document）
         event.stopPropagation();

         start = { x: touch.clientX, y: touch.clientY };
         last = { ...start };
         startTime = Date.now();
         isMoved = false;
         stopMomentum();
      },
      { passive: true }
   );

   addListener(
      domNode,
      'touchmove',
      (event: TouchEvent) => {
         if (event.touches.length !== 1) return;

         if (scrollbarDrag) {
            event.preventDefault();
            event.stopPropagation();
            updateScrollbarDrag(event.touches[0]!);
            return;
         }

         if (!start) return;

         const touch = event.touches[0]!;
         const dx = touch.clientX - last.x;
         const dy = touch.clientY - last.y;
         last = { x: touch.clientX, y: touch.clientY };

         if (!isMoved) {
            const moved =
               Math.hypot(
                  touch.clientX - start.x,
                  touch.clientY - start.y
               ) > tapSlop;
            if (!moved) return;
            isMoved = true;
         }
         if (isGestureReserved(event.target)) return;

         event.preventDefault();
         event.stopPropagation();

         // 拖动换算成编辑器滚动
         instance.setScrollTop(instance.getScrollTop() - dy);
         instance.setScrollLeft(instance.getScrollLeft() - dx);

         // 指数滑动平均追踪松手时的滚动速度
         const now = performance.now();
         const dt = now - lastMoveAt;
         if (dt > 0 && dt < 100) {
            velocity.x = 0.6 * velocity.x + 0.4 * (dx / dt);
            velocity.y = 0.6 * velocity.y + 0.4 * (dy / dt);
         } else {
            velocity = { x: 0, y: 0 };
         }
         lastMoveAt = now;
      },
      { passive: false }
   );

   addListener(
      domNode,
      'touchend',
      (event: TouchEvent) => {
         if (scrollbarDrag) {
            scrollbarDrag = null;
            return;
         }
         if (!start) return;
         start = null;

         const touch = event.changedTouches[0];
         if (!touch) return;

         if (isMoved) {
            startMomentum();
            return;
         }
         if (Date.now() - startTime > 400) return;
         if (isGestureReserved(event.target)) return;

         // 阻断浏览器由连续点按合成的 mouse 事件（dblclick 等）
         event.preventDefault();

         const position = positionAt(touch.clientX, touch.clientY);
         position && instance.setPosition(position);
         instance.focus();
      },
      { passive: false }
   );

   addListener(
      domNode,
      'touchcancel',
      () => {
         start = null;
         scrollbarDrag = null;
         stopMomentum();
      },
      { passive: true }
   );

   return {
      dispose: () => {
         stopMomentum();
         disposables.forEach((disposable) => disposable.dispose());
      },
   };
};
