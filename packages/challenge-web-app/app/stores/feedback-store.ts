import { defineStore } from 'pinia';

/** 反馈抽屉开关与列表失效版本，不持久化。 */
export const useFeedbackStore = defineStore('feedback', () => {
   const opened = ref(false);

   /** 数据变更版本号：提交 / 回复后递增 */
   const listVersion = ref(0);

   const open = () => {
      opened.value = true;
   };

   const close = () => {
      opened.value = false;
   };

   /** 标记反馈列表已过期 */
   const markListDirty = () => {
      listVersion.value += 1;
   };

   return { opened, open, close, listVersion, markListDirty };
});
