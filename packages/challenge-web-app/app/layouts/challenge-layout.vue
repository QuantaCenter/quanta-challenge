<script setup lang="ts">
import useAuthStore from '~/stores/auth-store';
import { useEditorStore } from '~/stores/editor-store';
import { HamburgerButton, Redo, Return, Undo } from '@icon-park/vue-next';

const store = useEditorStore();

// 提交记录页：移动端顶栏只保留一个「返回」按钮（回到做题页）
const route = useRoute();
const isRecordMode = computed(() => route.path.startsWith('/challenge/record'));
const path = useParam<string[]>('path', { required: true });
const problemId = computed(() => Number(path.value?.[1] ?? 0));

// 移动端抽屉内的导航跳转（如「提交记录」）后自动收起抽屉：
// 布局组件在题目/记录页之间复用不销毁，抽屉开关状态不会自动复位
watch(
   () => route.path,
   () => {
      store.mobileFileDrawerOpened = false;
   }
);

// 移动端顶栏撤回/重做
const { actions: mobileHistoryActions, canUndo, canRedo } =
   useMobileEditorHistory();

const authStore = useAuthStore();
const { $trpc } = useNuxtApp();
await authStore.fetchUserInfo($trpc);

/** 移动端判定：水合安全（SSR 与客户端首帧恒为 false，mounted 后同步真实值） */
const isMobile = useIsMobile();

// challenge 是全屏 IDE 布局，锁死 document 滚动：
// 移动端 100vh 大于可视高度时浏览器仍会出现整页橡皮筋滚动，必须从 body 层禁掉
useHead({
   bodyAttrs: { class: 'challenge-body-lock' },
});

const drawerRootRef = useTemplateRef<HTMLDivElement>('drawer-root');

/**
 * 抽屉打开时，遮罩与侧边栏上的滑动不允许透传成背后页面的滚动。
 * body 的 overflow:hidden 在 iOS 上挡不住这种穿透，必须对 touchmove
 * 显式 preventDefault；仅文件树容器内部允许正常滚动。
 */
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
         <!-- 桌面侧边栏：移动端隐藏，功能由「更多」抽屉承接 -->
         <StMiniSidebar class="max-md:hidden">
            <ChallengeSidebarContent />
         </StMiniSidebar>

         <!-- 移动端紧凑顶栏：左侧「更多」按钮打开抽屉；
              右侧是板块切换 Tab（由 EditorBoardLayout 通过 Teleport 注入，
              与顶栏按钮保持同一行高度对齐） -->
         <div
            class="hidden max-md:flex h-11 shrink-0 items-center gap-1.5 bg-[#1F1F1F] rounded-lg px-1.5">
            <!-- 提交记录页：顶栏仅剩「返回」按钮，回到做题页 -->
            <NuxtLink
               v-if="isRecordMode"
               :to="`/challenge/editor/${problemId}`"
               aria-label="返回题目"
               class="h-9 px-3 shrink-0 flex items-center gap-1 rounded-md bg-accent-600 text-white text-sm active:bg-accent-500 transition-colors cursor-pointer">
               <Return class="text-[1.1rem]" />
               <span>返回</span>
            </NuxtLink>
            <template v-else>
               <button
                  @click="store.mobileFileDrawerOpened = true"
                  aria-label="更多：打开文件树与操作菜单"
                  class="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-white active:bg-white/10 transition-colors cursor-pointer">
                  <HamburgerButton class="h-5 w-5" />
               </button>

               <button
                  @click="mobileHistoryActions?.undo()"
                  :disabled="!mobileHistoryActions || !canUndo"
                  aria-label="撤回"
                  class="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-white active:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                  <Undo class="h-5 w-5" />
               </button>
               <button
                  @click="mobileHistoryActions?.redo()"
                  :disabled="!mobileHistoryActions || !canRedo"
                  aria-label="重做"
                  class="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-white active:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                  <Redo class="h-5 w-5" />
               </button>
            </template>

            <div class="flex-1" />

            <!-- 板块切换 Tab 的挂载点（移动端）。
                 提交记录页不显示：编辑器组件在记录页下仍以 v-show 存活，
                 其 Teleport 进来的 Tab 会残留，这里直接隐藏挂载点 -->
            <div
               v-show="!isRecordMode"
               id="challenge-mobile-board-tabs"
               class="flex items-center gap-1 min-w-0 overflow-hidden" />
         </div>

         <!-- 主内容区 -->
         <div class="flex-1 h-full overflow-hidden min-w-0 max-md:min-h-0">
            <slot></slot>
         </div>

         <!-- 移动端「更多」抽屉：左侧是 PC 端侧边栏按钮，右侧是文件树。
              容器常驻 DOM（仅用样式显隐），因为做题页的文件树会 Teleport 进来 -->
         <div
            ref="drawer-root"
            class="hidden max-md:block fixed inset-0 z-[100]"
            :class="store.mobileFileDrawerOpened ? '' : 'pointer-events-none'">
            <!-- 遮罩 -->
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

            <!-- 抽屉面板：从左侧滑入。宽度用 88vw（显式视口单位）而不是百分比，
                 避免页面出现水平溢出时包含块变宽把抽屉/文件树撑大；
                 收起时同时 visibility:hidden，不参与溢出计算。
                 p-1 + gap-1 提供统一的 4px 间距，左列按钮栏与右列文件树
                 距抽屉四周的距离完全一致 -->
            <div
               class="absolute inset-y-0 left-0 flex bg-[#111111] shadow-2xl transition-all duration-200 ease-out rounded-r-xl overflow-hidden p-1 gap-1"
               :class="
                  store.mobileFileDrawerOpened
                     ? 'translate-x-0 visible'
                     : '-translate-x-full invisible'
               "
               style="width: 88vw; max-width: calc(100vw - 0.5rem)">
               <!-- 左列：原 PC 端侧边栏按钮（固定宽度，防止内容撑开） -->
               <StMiniSidebar v-if="isMobile" class="w-16 shrink-0 overflow-hidden">
                  <ChallengeSidebarContent />
               </StMiniSidebar>

               <!-- 右列：文件树（做题页通过 Teleport 挂载 FileManagerPanel）；
                    overscroll-y-contain 防止树滚到边界后把滑动链到背后的页面 -->
               <div
                  id="challenge-mobile-drawer-files"
                  class="flex-1 min-w-0 h-full overflow-hidden overscroll-y-contain" />
            </div>
         </div>

         <!-- 对话框覆盖层 -->
         <DialogOverlay />
      </div>
   </StMessageProvider>
</template>

<style>
/* challenge 布局期间锁死 document 滚动（桌面同为全屏布局，body 无需滚动）。
   离开 challenge 路由时 useHead 会自动移除该 class */
.challenge-body-lock {
   overflow: hidden;
   height: 100%;
   overscroll-behavior: none;
}
</style>
