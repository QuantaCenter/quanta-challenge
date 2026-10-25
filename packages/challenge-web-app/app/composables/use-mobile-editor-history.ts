/** 移动端顶栏「撤回 / 重做」的共享状态，由编辑器面板注册、顶栏按钮调用。 */
const mobileHistoryActions = ref<{
   undo: () => void;
   redo: () => void;
} | null>(null);

/** 当前文件是否还有可撤回 / 可重做的编辑（用于禁用顶栏按钮） */
const mobileCanUndo = ref(false);
const mobileCanRedo = ref(false);

export const useMobileEditorHistory = () => ({
   actions: mobileHistoryActions,
   canUndo: mobileCanUndo,
   canRedo: mobileCanRedo,
});
