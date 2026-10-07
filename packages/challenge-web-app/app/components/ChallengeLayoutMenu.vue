<script setup lang="ts">
import { Close, LayoutFour } from '@icon-park/vue-next';

/**
 * 侧边栏「布局」菜单。
 *
 * 这个按钮以前是死的（没有任何 @click），而面板布局本身也确实没有任何可操作项：
 * 比例只存在组件内存里、刷新即丢，也没有恢复默认的入口。这里把两件事补上。
 */
const opened = defineModel<boolean>('opened', { default: false });

const layoutStore = useLayoutStore();

const handleReset = () => {
   layoutStore.resetLayout();
   // 关掉弹窗，让用户直接看到面板回到默认比例
   opened.value = false;
};
</script>

<template>
   <StModal v-model:opened="opened">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="bg-accent-600 rounded-xl p-6 min-w-[380px] max-w-[460px] border border-accent-500 text-white">
         <!-- 标题 -->
         <StSpace justify="between" align="center" fill-x>
            <StSpace align="center" gap="0.5rem">
               <LayoutFour class="text-[1.25rem] text-accent-100" />
               <h2 class="text-xl font-semibold text-accent-50">布局</h2>
            </StSpace>
            <button
               class="text-accent-200 hover:text-accent-50 transition-colors cursor-pointer"
               aria-label="关闭布局设置"
               @click="opened = false">
               <Close />
            </button>
         </StSpace>

         <StSpace direction="vertical" gap="1.25rem" fill-x>
            <!-- 锁定面板 -->
            <StSpace justify="between" align="center" gap="1rem" fill-x>
               <span class="text-accent-100">锁定面板拖拽</span>
               <StSwitch v-model="layoutStore.locked" />
            </StSpace>

            <!-- 恢复默认 -->
            <StSpace direction="vertical" gap="0.5rem" fill-x>
               <button
                  class="w-full rounded-md bg-accent-500 hover:bg-accent-400 transition-colors text-accent-100 py-2 cursor-pointer"
                  @click="handleReset">
                  恢复默认布局
               </button>
            </StSpace>
         </StSpace>
      </StSpace>
   </StModal>
</template>
