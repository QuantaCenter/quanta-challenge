<script setup lang="ts">
import useAuthStore from '~/stores/auth-store';
import { useEditorStore } from '~/stores/editor-store';
import { HamburgerButton, Redo, Undo } from '@icon-park/vue-next';

/**
 * 工坊布局：与 challenge-layout 同构（迷你侧边栏 + 全屏 IDE + 移动端顶栏/抽屉），
 * 只是侧边栏换成工坊的操作。移动端 Teleport 目标 id 需与 EditorBoardLayout、
 * 编辑器页面保持一致，因此沿用 challenge-mobile-* 命名。
 */

const store = useEditorStore();
const route = useRoute();

watch(
   () => route.path,
   () => {
      store.mobileFileDrawerOpened = false;
   },
);

const { actions: mobileHistoryActions, canUndo, canRedo } =
   useMobileEditorHistory();

const authStore = useAuthStore();
const { $trpc } = useNuxtApp();
await authStore.fetchUserInfo($trpc);

const isMobile = useIsMobile();

useHead({
   htmlAttrs: { class: 'workshop-html-lock' },
   bodyAttrs: { class: 'workshop-body-lock' },
});

const drawerRootRef = useTemplateRef<HTMLDivElement>('drawer-root');

// 抽屉打开时阻止触摸滚动穿透，仅文件树容器内部允许滚动
let detachDrawerTouchLock: (() => void) | null = null;
onMounted(() => {
   const el = drawerRootRef.value;
   if (!el) return;
   const onTouchMove = (event: TouchEvent) => {
      const target = event.target;
      if (
         target instanceof Element &&
         target.closest('#challenge-mobile-drawer-files')
      ) {
         return;
      }
      event.preventDefault();
   };
   el.addEventListener('touchmove', onTouchMove, { passive: false });
   detachDrawerTouchLock = () =>
      el.removeEventListener('touchmove', onTouchMove);
});
onUnmounted(() => detachDrawerTouchLock?.());
</script>

<template>
   <StMessageProvider>
      <div
         class="flex h-screen w-full bg-[#111111] p-3 gap-3 max-md:h-dvh max-md:flex-col max-md:p-1 max-md:gap-1 max-md:overflow-hidden">
         <StMiniSidebar class="max-md:hidden">
            <WorkshopSidebarContent />
         </StMiniSidebar>

         <div
            class="hidden max-md:flex h-11 shrink-0 items-center gap-1.5 bg-[#1F1F1F] rounded-lg px-1.5">
            <button
               @click="store.mobileFileDrawerOpened = true"
               aria-label="更多：打开文件树与操作菜单"
               class="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-white active:bg-white/10 transition-colors cursor-pointer">
               <HamburgerButton
                  class="h-5 w-5 inline-flex items-center justify-center" />
            </button>
            <button
               @click="mobileHistoryActions?.undo()"
               :disabled="!mobileHistoryActions || !canUndo"
               aria-label="撤回"
               class="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-white active:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
               <Undo class="h-5 w-5 inline-flex items-center justify-center" />
            </button>
            <button
               @click="mobileHistoryActions?.redo()"
               :disabled="!mobileHistoryActions || !canRedo"
               aria-label="重做"
               class="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-white active:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
               <Redo class="h-5 w-5 inline-flex items-center justify-center" />
            </button>

            <div class="flex-1" />

            <div
               id="challenge-mobile-board-tabs"
               class="flex items-center gap-1 min-w-0 overflow-hidden" />
         </div>

         <div class="flex-1 h-full overflow-hidden min-w-0 max-md:min-h-0">
            <slot></slot>
         </div>

         <div
            ref="drawer-root"
            class="hidden max-md:block fixed inset-0 z-[100]"
            :class="store.mobileFileDrawerOpened ? '' : 'pointer-events-none'">
            <Transition
               enter-active-class="transition-opacity duration-200"
               enter-from-class="opacity-0"
               enter-to-class="opacity-100"
               leave-active-class="transition-opacity duration-200"
               leave-from-class="opacity-100"
               leave-to-class="opacity-0">
               <div
                  v-show="store.mobileFileDrawerOpened"
                  class="absolute inset-0 bg-black/60"
                  @click="store.mobileFileDrawerOpened = false" />
            </Transition>

            <div
               class="absolute inset-y-0 left-0 flex bg-[#111111] shadow-2xl transition-all duration-200 ease-out rounded-r-xl overflow-hidden p-1 gap-1"
               :class="
                  store.mobileFileDrawerOpened
                     ? 'translate-x-0 visible'
                     : '-translate-x-full invisible'
               "
               style="width: 88vw; max-width: calc(100vw - 0.5rem)">
               <StMiniSidebar
                  v-if="isMobile"
                  hide-tooltips
                  class="w-16 shrink-0 overflow-hidden">
                  <WorkshopSidebarContent />
               </StMiniSidebar>

               <div
                  id="challenge-mobile-drawer-files"
                  class="flex-1 min-w-0 h-full overflow-hidden overscroll-y-contain" />
            </div>
         </div>

         <DialogOverlay />
      </div>
   </StMessageProvider>
</template>

<style>
.workshop-html-lock {
   overflow: hidden;
   height: 100%;
}

.workshop-body-lock {
   overflow: hidden;
   height: 100%;
   overscroll-behavior: none;
}
</style>
