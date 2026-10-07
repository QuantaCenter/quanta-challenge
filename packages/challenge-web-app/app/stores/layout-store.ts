import { moveBoard, normalizeBoardLayout } from '~/utils/board-layout';

/** 做题页的三个板块 */
export type EditorBoardId = 'files' | 'code' | 'preview';

export const EDITOR_BOARD_DEFAULT_ORDER: EditorBoardId[] = [
   'files',
   'code',
   'preview',
];

/**
 * 三个板块的默认宽度（百分比，和 EDITOR_BOARD_DEFAULT_ORDER 一一对应）。
 * 数值取自改造前的实际布局：外层资源管理器 23%，剩下 77% 里代码编辑器占 55%
 * （≈ 整宽 42%），实时预览占 45%（≈ 35%）。
 */
export const EDITOR_BOARD_DEFAULT_SIZES: number[] = [23, 42, 35];

/** 布局持久化用的 cookie 名 */
const LAYOUT_COOKIE = 'challenge-layout';

type StoredLayout = {
   panelSizes: Record<string, number>;
   locked: boolean;
   order: string[];
   sizes: number[];
};

const defaultLayout = (): StoredLayout => ({
   panelSizes: {},
   locked: false,
   order: [...EDITOR_BOARD_DEFAULT_ORDER],
   sizes: [...EDITOR_BOARD_DEFAULT_SIZES],
});

/**
 * 做题页的面板布局状态。
 *
 * 背景：面板比例原先只活在 SplitPanel 组件内部的一个普通对象里（连 ref 都不是），
 * 刷新页面就回到写死的 `start-percent`；侧边栏那个「布局」按钮也没有接任何逻辑。
 * 这里把它收成单一数据源并持久化，同时给「重置布局」提供一个明确入口。
 *
 * **为什么用 cookie 而不是 localStorage**：
 * localStorage 在服务端读不到 —— SSR 只能渲染默认布局，客户端首次渲染却用用户自定义布局，
 * 于是水合不一致，页面上表现为"所有栏目先按默认排布，然后突然闪成自定义样式"。
 * cookie 服务端能读到，SSR 与客户端首次渲染拿到同一份数据，闪烁随之消失。
 */
export const useLayoutStore = defineStore('layout', () => {
   const stored = useCookie<StoredLayout>(LAYOUT_COOKIE, {
      default: defaultLayout,
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      // 纯前端偏好，不需要 httpOnly（客户端要读写），也不能加密（SSR 要读内容）
   });

   const layout = computed<StoredLayout>(() => stored.value ?? defaultLayout());

   const write = (patch: Partial<StoredLayout>) => {
      stored.value = { ...layout.value, ...patch };
   };

   /** 通用分隔条比例：storageKey -> start 侧百分比（SplitPanel 用） */
   const panelSizes = computed(() => layout.value.panelSizes ?? {});

   /** 全局锁定：锁住后所有面板分隔条不可拖动（防误触） */
   const locked = computed({
      get: () => layout.value.locked ?? false,
      set: (value: boolean) => write({ locked: value }),
   });

   const editorBoardLayout = computed(() =>
      normalizeBoardLayout(layout.value.order, layout.value.sizes, {
         order: [...EDITOR_BOARD_DEFAULT_ORDER],
         sizes: [...EDITOR_BOARD_DEFAULT_SIZES],
      })
   );

   /**
    * 布局重置信号。
    *
    * **不持久化**，只用来通知各个面板"把组件内部的临时比例丢掉"。
    * 少了它会出现一个很隐蔽的 bug：SplitPanel 里拖拽/折叠留下的 `override`
    * 优先级高于持久化值，于是「恢复默认布局」清掉持久化值之后面板**纹丝不动**——
    * 看起来就像按钮没生效。
    */
   const resetToken = ref(0);

   const getPanelSize = (key: string | undefined, fallback: number) => {
      if (!key) return fallback;
      const value = panelSizes.value?.[key];
      return typeof value === 'number' && Number.isFinite(value)
         ? value
         : fallback;
   };

   const setPanelSize = (key: string | undefined, percent: number) => {
      if (!key || !Number.isFinite(percent)) return;
      write({ panelSizes: { ...panelSizes.value, [key]: percent } });
   };

   /** 拖动某个板块到另一个板块的位置（宽度跟着板块走） */
   const moveEditorBoard = (from: EditorBoardId, to: EditorBoardId) => {
      const { order, sizes } = editorBoardLayout.value;
      const next = moveBoard(order, sizes, from, to);

      write({ order: next.order, sizes: next.sizes });
   };

   /** 拖动分隔条后按视觉顺序写回三个板块的宽度 */
   const setEditorBoardSizes = (sizes: number[]) => {
      write({ sizes: [...sizes] });
   };

   /** 清掉所有已保存的布局：面板比例、板块排列与宽度，并通知各面板丢弃临时值 */
   const resetLayout = () => {
      write(defaultLayout());
      resetToken.value += 1;
   };

   const setLocked = (state: boolean) => {
      write({ locked: state });
   };

   const toggleLocked = () => {
      write({ locked: !locked.value });
   };

   return {
      panelSizes,
      locked,
      resetToken,
      editorBoardLayout,
      getPanelSize,
      setPanelSize,
      moveEditorBoard,
      setEditorBoardSizes,
      resetLayout,
      setLocked,
      toggleLocked,
   };
});
