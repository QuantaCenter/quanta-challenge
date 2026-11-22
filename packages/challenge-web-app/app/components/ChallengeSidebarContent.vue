<script setup lang="ts">
import {
   AlignTextLeftOne,
   History,
   Return,
   UploadWeb,
} from '@icon-park/vue-next';
import { PanelsTopLeft } from 'lucide-vue-next';
import { useEventEmitter } from '~/composables/use-event-emitter';
import { useParam } from '~/composables/use-param';
import useAuthStore from '~/stores/auth-store';
import { useMessageOutsideVue } from '~/components/st/Message/use-message';
import { openProblemDesignWindow } from '~/utils/open-problem-design-window';

/** 移动端隐藏「题目详情」（题面已是分页板块）与「布局设置」（桌面专属功能）按钮。
 *  水合安全判定：SSR 与客户端首帧恒为 false，mounted 后才隐藏 */
const isMobile = useIsMobile();

/** 嵌入模式只保留做题必需的按钮：计时器、布局设置、头像都交给独立做题页 */
const { embedded, withEmbed } = useChallengeEmbed();

const store = useEditorStore();
const toggleDetailWindow = () => {
   store.detailWindowOpened = !store.detailWindowOpened;
};

/**
 * 提交事件。
 *
 * 显式声明载荷类型：监听方 CommitModal 只将事件作为触发信号，
 * 载荷仅携带一个时间戳用于"每次点击都会触发"。
 */
const { emit: emitCommitEvent } = useEventEmitter<{ at: number }>(
   'challenge-layout',
   'commit',
);

/** 提交按钮点击处理：不可用时明确弹出原因。 */
const handleCommitClick = () => {
   if (store.hasProjectInitialized) {
      emitCommitEvent({ at: Date.now() });
      return;
   }

   const reason =
      store.commitBlockedReason ?? '在线开发容器尚未就绪，暂时无法提交。';
   console.warn('[challenge] 提交被阻止:', reason);
   try {
      useMessageOutsideVue().warning('暂时无法提交', reason);
   } catch {
      // 消息系统不可用时忽略（上方已 console.warn）
   }
};

const path = useParam<string[]>('path', { required: true });
const id = computed(() => Number(path.value?.[1] ?? 0));
// 题目详情在编辑器子页加载，侧栏在首轮水合之后再读取该状态。
const mounted = useMounted();
const hasDesign = computed(() => mounted.value && store.designProblemId === id.value);
const designPath = computed(() => `/design/${id.value}`);
const openMobileDesign = () => {
   openProblemDesignWindow(designPath.value);
   store.mobileFileDrawerOpened = false;
};

const route = useRoute();
const mode = computed<'problem' | 'record'>(() => {
   if (route.path.startsWith('/challenge/record')) return 'record';
   return 'problem';
});

const authStore = useAuthStore();
const avatarUrl = computed(() => {
   // 用 avatar.name（数据库里的真实文件名）
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId ? `/api/static/${user.imageId}` : '';
});

const sidebarItemClass =
   'size-[var(--mini-sidebar-item,2.75rem)] flex items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors';
const itemClass = `${sidebarItemClass} cursor-pointer`;
const designItemClass = `${sidebarItemClass} hover:cursor-pointer active:bg-accent-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-expanded:bg-primary/15 aria-expanded:text-primary aria-expanded:hover:bg-primary/25 aria-expanded:active:bg-primary/35`;
</script>

<template>
   <StMiniSidebarDivider v-if="!embedded" />

   <template v-if="mode === 'problem'">
      <EditorSidebarTools section="panels" />
      <StMiniSidebarDivider />
   </template>

   <StSpace direction="vertical" align="center" gap="0.5rem">
      <template v-if="mode === 'record'">
         <StSidebarSidePopper content="返回题目">
            <NuxtLink :to="withEmbed(`/challenge/editor/${id}`)">
               <StRippleEffect>
                  <button :class="itemClass">
                     <Return class="text-[1.1rem]" />
                  </button>
               </StRippleEffect>
            </NuxtLink>
         </StSidebarSidePopper>
      </template>

      <template v-if="mode === 'problem'">
         <StSidebarSidePopper v-if="!isMobile" content="题目">
            <StRippleEffect>
               <button
                  @click="toggleDetailWindow"
                  :class="[itemClass, { '!text-primary': store.detailWindowOpened }]">
                  <AlignTextLeftOne class="text-[1.1rem]" />
               </button>
            </StRippleEffect>
         </StSidebarSidePopper>

         <template v-if="hasDesign">
            <StSidebarSidePopper v-if="isMobile" content="设计稿">
               <NuxtLink
                  :to="designPath"
                  target="_blank"
                  rel="noopener"
                  :class="designItemClass"
                  aria-label="在新窗口打开设计稿"
                  @click.prevent="openMobileDesign">
                  <PanelsTopLeft :size="18" />
               </NuxtLink>
            </StSidebarSidePopper>
            <StSidebarSidePopper v-else content="设计稿">
               <button
                  type="button"
                  aria-label="设计稿"
                  :aria-expanded="store.designWindowOpened"
                  :class="designItemClass"
                  @click="store.designWindowOpened = !store.designWindowOpened">
                  <PanelsTopLeft :size="18" />
               </button>
            </StSidebarSidePopper>
         </template>

         <StSidebarSidePopper content="提交记录">
            <NuxtLink :to="withEmbed(`/challenge/record/${id}`)">
               <StRippleEffect>
                  <button :class="itemClass">
                     <History class="text-[1.1rem]" />
                  </button>
               </StRippleEffect>
            </NuxtLink>
         </StSidebarSidePopper>

         <StMiniSidebarButton
            @click="handleCommitClick"
            :name="
               store.hasProjectInitialized
                  ? '提交'
                  : '提交（容器未就绪，点击查看原因）'
            "
            :aria-disabled="!store.hasProjectInitialized"
            class="!text-success"
            :class="{
               '!opacity-40 !text-accent-300': !store.hasProjectInitialized,
            }">
            <UploadWeb class="text-[1.1rem]" />
         </StMiniSidebarButton>

         <TimerWidget v-if="!embedded" :toolbar="true" />
      </template>
   </StSpace>

   <template v-if="mode === 'problem'">
      <StMiniSidebarDivider />

      <StSpace direction="vertical" align="center" gap="0.5rem">
         <EditorSidebarTools section="search" />

         <CloudFunctionTokenWidget
            v-if="mounted && store.problemCloudFunction?.problemId === id"
            :key="id"
            :function-name="store.problemCloudFunction.name"
            :toolbar="true" />

         <ChallengeLayoutMenu v-if="!isMobile && !embedded" />
      </StSpace>
   </template>

   <div class="flex-1" />

   <StSpace direction="vertical" align="center" gap="0.5rem" class="mb-1">
      <FeedbackButton v-if="!isMobile && !embedded" variant="sidebar" />
      <ChallengeSettingsMenu :problem-id="mode === 'problem' ? id : undefined" />

      <StAvatar v-if="!embedded" size="2.25rem" :url="avatarUrl" />
   </StSpace>
</template>
