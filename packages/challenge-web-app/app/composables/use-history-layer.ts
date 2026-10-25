/** 全局弹层历史栈管理 */
type HistoryLayer = {
   close: () => void;
   viaPopstate: boolean;
};

const stack: HistoryLayer[] = [];
let suppressCount = 0;
let bound = false;

const onPopState = () => {
   // 主动关闭触发的 history.back()：仅消费抑制计数，不关闭任何弹层
   if (suppressCount > 0) {
      suppressCount--;
      return;
   }
   // 返回键：只关闭当前栈顶的弹层
   const top = stack[stack.length - 1];
   if (!top) return;
   top.viaPopstate = true;
   top.close();
};

export function useHistoryLayer() {
   const layer: HistoryLayer = {
      close: () => {},
      viaPopstate: false,
   };
   let inStack = false;

   /** 弹层打开时调用：压入一条历史记录并成为栈顶 */
   const acquire = () => {
      if (!import.meta.client || inStack) return;
      inStack = true;
      if (!bound) {
         window.addEventListener('popstate', onPopState);
         bound = true;
      }
      stack.push(layer);
      history.pushState({ stHistoryLayer: true }, '');
   };

   /** 弹层关闭时调用：移出全局栈；主动关闭时回退自己压入的历史记录 */
   const release = () => {
      if (!inStack) return;
      inStack = false;
      const viaPopstate = layer.viaPopstate;
      layer.viaPopstate = false;
      const index = stack.indexOf(layer);
      // 本层之上还有更高层弹层（如抽屉内还开着日期选择器）时，先逐层关闭它们，
      // 各层会在自己的 release 中回退各自的历史记录
      for (let i = stack.length - 1; i > index; i--) {
         const above = stack[i];
         if (!above) continue;
         above.viaPopstate = false;
         above.close();
      }
      if (index !== -1) stack.splice(index, 1);
      // 由返回键触发的关闭：popstate 已完成回退，不再调用 history.back()
      if (!viaPopstate && import.meta.client) {
         suppressCount++;
         history.back();
      }
   };

   /** 注册由返回键（popstate）触发的关闭逻辑 */
   const onClose = (callback: () => void) => {
      layer.close = callback;
   };

   return { acquire, release, onClose };
}
