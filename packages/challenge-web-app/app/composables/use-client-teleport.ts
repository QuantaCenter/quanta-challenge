/**
 * 客户端延迟传送：服务端与水合期间禁用 Teleport（内容内联渲染，默认隐藏，无视觉影响），
 * 挂载后再传送到目标节点。
 *
 * 背景：Nuxt 的布局/页面是异步组件（Suspense + __asyncHydrate 延迟水合），多个
 * <Teleport to="body"> 的 SSR 内容按渲染顺序写入 body，而客户端水合时异步子树的
 * teleport 完成顺序取决于 chunk 加载顺序，与 SSR 顺序不一致时共享游标错位，
 * 引发整组 "Hydration node/children mismatch" 级联告警。
 * 水合期间禁用的 Teleport 与顺序无关（锚点对为匿名空注释），可彻底规避。
 */
export const useClientTeleport = () => {
   const teleported = ref(false);
   onMounted(() => {
      teleported.value = true;
   });
   return teleported;
};
