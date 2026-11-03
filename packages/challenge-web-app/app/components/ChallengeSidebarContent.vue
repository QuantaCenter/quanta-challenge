<script setup lang="ts">
import {
   AlignTextLeftOne,
   History,
   Return,
   UploadWeb,
} from '@icon-park/vue-next';
import { useEventEmitter } from '~/composables/use-event-emitter';
import { useParam } from '~/composables/use-param';
import useAuthStore from '~/stores/auth-store';
import { useMessageOutsideVue } from '~/components/st/Message/use-message';
import { PanelLeft, SquareTerminal } from 'lucide-vue-next';

/** 移动端隐藏「题目详情」（题面已是分页板块）与「布局设置」（桌面专属功能）按钮。
 *  水合安全判定：SSR 与客户端首帧恒为 false，mounted 后才隐藏 */
const isMobile = useIsMobile();

/** 嵌入模式只保留做题必需的按钮：计时器、布局设置、头像都交给独立做题页 */
const { embedded, withEmbed } = useChallengeEmbed();

const store = useEditorStore();
const layoutStore = useLayoutStore();
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

const itemClass =
   'size-[var(--mini-sidebar-item,2.75rem)] flex items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors cursor-pointer';
</script>

<template>
   <StMiniSidebarDivider />

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

         <StSidebarSidePopper content="提交记录">
            <NuxtLink :to="withEmbed(`/challenge/record/${id}`)">
               <StRippleEffect>
                  <button :class="itemClass">
                     <History class="text-[1.1rem]" />
                  </button>
               </StRippleEffect>
            </NuxtLink>
         </StSidebarSidePopper>
      </template>
   </StSpace>

   <template v-if="mode === 'problem'">
      <StMiniSidebarDivider />

      <StSpace direction="vertical" align="center" gap="0.5rem">
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

         <CloudFunctionTokenWidget v-if="store.cloudFunctionEnabled" :toolbar="true" />

         <ChallengeLayoutMenu v-if="!isMobile && !embedded" />
      </StSpace>

      <!-- 终端按钮在移动端也可见，分隔线应始终保留。 -->
      <StMiniSidebarDivider />
      <StSpace direction="vertical" align="center" gap="0.5rem">
         <StMiniSidebarButton
            v-if="!isMobile"
            name="文件栏"
            :aria-label="layoutStore.filesVisible ? '隐藏文件栏' : '显示文件栏'"
            :aria-pressed="layoutStore.filesVisible"
            :class="{ '!text-primary': layoutStore.filesVisible }"
            @click="layoutStore.filesVisible = !layoutStore.filesVisible">
            <PanelLeft :size="18" />
         </StMiniSidebarButton>
         <StMiniSidebarButton
            name="终端"
            :aria-label="store.terminalVisible ? '隐藏终端' : '显示终端'"
            :aria-pressed="store.terminalVisible"
            :class="{ '!text-primary': store.terminalVisible }"
            @click="store.terminalVisible = !store.terminalVisible">
            <SquareTerminal :size="18" />
         </StMiniSidebarButton>
      </StSpace>
   </template>

   <div class="flex-1" />

   <StSpace direction="vertical" align="center" gap="0.5rem" class="mb-1">
      <ChallengeSettingsMenu :problem-id="mode === 'problem' ? id : undefined" />

      <StAvatar v-if="!embedded" size="2.25rem" :url="avatarUrl" />
   </StSpace>
</template>
