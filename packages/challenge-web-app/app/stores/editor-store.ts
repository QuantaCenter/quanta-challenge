export const useEditorStore = defineStore('editor', () => {
   const detailWindowOpened = ref(false);
   const hasProjectInitialized = ref(false);

   /**
    * 开发容器启动失败的原因；null 表示尚未失败。
    *
    * 为什么需要它：提交按钮原先只依据 hasProjectInitialized 决定是否禁用，
    * 而该标志只有在 WebContainer 成功启动并跑完 boot 命令后才会置为 true。
    * 一旦容器起不来（例如运行时 CDN 被网络阻断），按钮会长期呈灰色禁用状态，
    * 却没有任何文字说明——用户会以为"根本没有提交按钮"。
    */
   const initFailureReason = ref<string | null>(null);

   /** 启动流程是否已经开始（用于区分"进行中"与"从未触发"） */
   const initStarted = ref(false);

   const cloudFunctionEnabled = ref(false);

   /** 提交按钮是否可用 */
   const canCommit = computed(() => hasProjectInitialized.value);

   /** 提交不可用时的原因说明 */
   const commitBlockedReason = computed<string | null>(() => {
      if (hasProjectInitialized.value) return null;
      if (initFailureReason.value) {
         return `在线开发容器未能启动，因此无法提交。原因：${initFailureReason.value}`;
      }
      if (initStarted.value) {
         return '在线开发容器仍在启动中，请等启动完成后再提交。';
      }
      return '在线开发容器尚未启动，请刷新页面，并查看浏览器控制台的 [webcontainer] 日志。';
   });

   return {
      detailWindowOpened,
      hasProjectInitialized,
      initFailureReason,
      initStarted,
      cloudFunctionEnabled,
      canCommit,
      commitBlockedReason,
   };
});
