/** 「隐藏按钮 tooltip」注入开关：移动端抽屉里的迷你侧边栏（StMiniSidebar）会 provide，
 *  按钮提示层（StSidebarSidePopper）注入后不再渲染 tooltip */
export const MINI_SIDEBAR_TOOLTIP_HIDDEN_KEY = Symbol(
	'miniSidebarTooltipHidden',
);
