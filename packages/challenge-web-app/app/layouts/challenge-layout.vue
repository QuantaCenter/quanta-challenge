<script setup lang="ts">
import {
   AlignTextLeftOne,
   History,
   LayoutFour,
   Return,
   SettingOne,
   UploadWeb,
} from '@icon-park/vue-next';
import { useEventEmitter } from '~/composables/use-event-emitter';
import { useParam } from '~/composables/use-param';
import useAuthStore from '~/stores/auth-store';
import { useMessageOutsideVue } from '~/components/st/Message/use-message';

const store = useEditorStore();
const toggleDetailWindow = () => {
   store.detailWindowOpened = !store.detailWindowOpened;
};

/** 侧边栏「布局」菜单的开关 */
const layoutMenuOpened = ref(false);

/**
 * 提交事件。
 *
 * 显式声明载荷类型（而不是让 T 退化为 any）：
 * 监听方 CommitModal 只用 `watch(event, ...)` 作为触发信号，不关心具体内容，
 * 因此载荷仅携带一个时间戳用于"每次点击都会触发"。
 */
const { emit: emitCommitEvent } = useEventEmitter<{ at: number }>(
   'challenge-layout',
   'commit',
);

/**
 * 提交按钮点击处理。
 *
 * 原先按钮在容器未就绪时只是变灰（40% 透明）且不可点击，**没有任何文字说明**，
 * 用户会误以为"没有提交按钮"。这里改为：不可用时明确弹出原因。
 */
const handleCommitClick = () => {
   if (store.hasProjectInitialized) {
      emitCommitEvent({ at: Date.now() });
      return;
   }

   const reason = store.commitBlockedReason ?? '在线开发容器尚未就绪，暂时无法提交。';
   console.warn('[challenge] 提交被阻止:', reason);
   try {
      useMessageOutsideVue().warning('暂时无法提交', reason);
   } catch {
      // 消息系统在极早期不可用时，至少保证控制台有记录（上面已 warn）
   }
};

const path = useParam<string[]>('path', { required: true });

/**
 * 侧栏里的 pid。
 *
 * ⚠️ 不能直接 `Number(path[1])`：做题页的新地址是
 * `/challenge/editor/by-base/:baseId`，第 2 段是字符串 `by-base` → NaN，
 * 于是侧栏「返回题目」「提交记录」会分别跳到 `/challenge/editor/NaN`
 * 与 `/challenge/record/NaN`。用统一的解析函数拿目标：
 * 记录页取 pid，做题页按**题号**回跳（跳回 by-base 才与版本无关）。
 */
const view = computed<'problem' | 'record'>(() =>
   path.value?.[0] === 'record' ? 'record' : 'problem',
);
const baseId = computed(() => {
   const value = path.value;
   if (value?.[0] === 'editor' && value[1] === 'by-base') {
      const parsed = Number(value[2]);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
   }
   return null;
});
const id = computed(() => {
   const value = path.value;
   if (view.value === 'record') {
      const parsed = Number(value?.[1]);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
   }
   // 老地址 `/challenge/editor/:pid` 仍然可用
   const parsed = Number(value?.[1]);
   return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
});
/** 返回题目：优先按题号（by-base），否则用 pid */
const problemBackTo = computed(() =>
   baseId.value ? `/challenge/editor/by-base/${baseId.value}` : id.value ? `/challenge/editor/${id.value}` : '/app/problems',
);
const recordTo = computed(() =>
   id.value ? `/challenge/record/${id.value}` : '/app/problems',
);

const route = useRoute();
const mode = computed<'problem' | 'record'>(() => {
   if (route.path.startsWith('/challenge/record')) return 'record';
   return 'problem';
});

const authStore = useAuthStore();
const { $trpc } = useNuxtApp();
await authStore.fetchUserInfo($trpc);

const avatarUrl = computed(() => {
   // 同 app-layout.vue：用 avatar.name（数据库里的真实文件名），不要硬拼 .jpg
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId ? `/api/static/${user.imageId}` : '';
});
</script>

<template>
   <StMessageProvider>
      <div class="flex h-screen w-full bg-[#111111] p-3 gap-3">
         <StMiniSidebar>
            <StMiniSidebarDivider />

            <!-- 导航按钮组 -->
            <StSpace direction="vertical" align="center" gap="0.5rem">
               <template v-if="mode === 'record'">
                  <StSidebarSidePopper content="返回题目">
                     <NuxtLink :to="problemBackTo">
                        <StRippleEffect>
                           <button
                              class="size-[2.75rem] flex items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors cursor-pointer">
                              <Return class="text-[1.1rem]" />
                           </button>
                        </StRippleEffect>
                     </NuxtLink>
                  </StSidebarSidePopper>
               </template>

               <template v-if="mode === 'problem'">
                  <StSidebarSidePopper content="题目">
                     <StRippleEffect>
                        <button
                           @click="toggleDetailWindow"
                           class="size-[2.75rem] flex items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors cursor-pointer"
                           :class="{
                              '!text-primary': store.detailWindowOpened,
                           }">
                           <AlignTextLeftOne class="text-[1.1rem]" />
                        </button>
                     </StRippleEffect>
                  </StSidebarSidePopper>

                  <StSidebarSidePopper content="提交记录">
                     <NuxtLink :to="recordTo">
                        <StRippleEffect>
                           <button
                              class="size-[2.75rem] flex items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors cursor-pointer">
                              <History class="text-[1.1rem]" />
                           </button>
                        </StRippleEffect>
                     </NuxtLink>
                  </StSidebarSidePopper>
               </template>
            </StSpace>

            <!-- 操作按钮组 -->
            <template v-if="mode === 'problem'">
               <StMiniSidebarDivider />

               <StSpace direction="vertical" align="center" gap="0.5rem">
                  <!-- 注意：这里刻意 **不** 使用原生 disabled 属性。
                       原生 disabled 的按钮不会触发 click，用户点了没有任何反应，
                       也就看不到"为什么不能提交"。改为用样式表达不可用，
                       并让点击能弹出具体原因。 -->
                  <StMiniSidebarButton
                     @click="handleCommitClick"
                     :name="
                        store.hasProjectInitialized
                           ? '提交'
                           : '提交（容器未就绪，点击查看原因）'
                     "
                     :aria-disabled="!store.hasProjectInitialized"
                     class="size-[2.75rem] flex items-center justify-center rounded-full bg-accent-600 hover:bg-accent-500 transition-colors cursor-pointer !text-success"
                     :class="{
                        '!opacity-40 !text-accent-300':
                           !store.hasProjectInitialized,
                     }">
                     <UploadWeb class="text-[1.1rem]" />
                  </StMiniSidebarButton>

                  <TimerWidget :toolbar="true" />

                  <CloudFunctionTokenWidget
                     v-if="store.cloudFunctionEnabled"
                     :toolbar="true" />

                  <StMiniSidebarButton
                     name="布局"
                     @click="layoutMenuOpened = true">
                     <LayoutFour class="text-[1.1rem]" />
                  </StMiniSidebarButton>
               </StSpace>
            </template>

            <!-- 弹性空间 -->
            <div class="flex-1" />

            <!-- 底部按钮 -->
            <StSpace
               direction="vertical"
               align="center"
               gap="0.5rem"
               class="mb-1">
               <StSidebarSidePopper content="设置">
                  <StRippleEffect>
                     <button
                        class="size-[2.75rem] flex items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors cursor-pointer">
                        <SettingOne class="text-[1.1rem]" />
                     </button>
                  </StRippleEffect>
               </StSidebarSidePopper>

               <StAvatar size="2.25rem" :url="avatarUrl" />
            </StSpace>
         </StMiniSidebar>

         <!-- 主内容区 -->
         <div class="flex-1 h-full overflow-hidden">
            <slot></slot>
         </div>

         <!-- 对话框覆盖层 -->
         <DialogOverlay />

         <!-- 布局设置（面板比例 / 锁定 / 恢复默认） -->
         <ChallengeLayoutMenu v-model:opened="layoutMenuOpened" />
      </div>
   </StMessageProvider>
</template>
