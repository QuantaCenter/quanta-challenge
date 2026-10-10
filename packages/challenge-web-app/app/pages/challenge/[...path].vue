<script setup lang="ts">
import { useParam } from '~/composables/use-param';
import LazyEditor from './_subpages/editor/index.vue';
import LazyRecord from './_subpages/record/index.vue';
import { logger } from '~~/lib/logger';
import { resolveProblemRoute } from '~/utils/problem-route';

definePageMeta({
   layout: 'challenge-layout',
   key: 'challenge-detail',
});

const path = useParam<string[]>('path', {
   required: true,
   onError: () => navigateTo('/app/problems'),
});

/**
 * 两种进入方式，统一在一处解析：
 *
 *   · `/challenge/editor/by-base/:baseId` —— 正文里引用题目用的是**题号**，
 *     链接也按题号写（重新发布会换 pid，写死 pid 就会点到作废版本）；
 *   · `/challenge/editor/:pid` —— 历史/直接贴地址的写法，pid 就是版本号。
 *
 * 解析结果 `resolvedPid` 是**当前应该渲染的版本**：by-base 走服务端解析，
 * 直接给 pid 的走可用性校验。解析完成后就地渲染编辑器，**不再跳转**——
 * 之前"先跳一次再校验"的做法会让页面闪一下深色编辑器，观感就是黑屏。
 */
/**
 * 地址解析的唯一真源：`~/utils/problem-route`。
 *
 * 分支顺序（by-base 优先于 pid 校验）在那里有测试钉死；
 * 这里只做分发，不再自己拼条件。
 */
const target = computed(() => resolveProblemRoute(path.value));
const byBaseId = computed(() =>
   target.value.kind === 'byBase' ? target.value.baseId : 0,
);
const directPid = computed(() =>
   target.value.kind === 'direct' ? target.value.pid : 0,
);
const isRecord = computed(() => path.value?.[0] !== 'editor');

/** 记录页用 pid；做题页请用 `resolvedPid`（它才是"当前应渲染的版本"） */
const id = computed(() => Number(path.value?.[1] ?? 0));

/**
 * 解析中的目标 pid（null 表示"这道题现在不可用"）。
 *
 * 初始值：直接给 pid 的地址（`/challenge/editor/15`）先按它渲染，
 * 保证 SSR 与首帧就是编辑器（可用性仍在客户端异步校验，不通过就换成说明页）；
 * `by-base` 必须先解析，所以初始为 null。
 */
const resolvedPid = ref<number | null>(
   path.value?.[0] === 'editor' && path.value?.[1] !== 'by-base'
      ? Number(path.value?.[1] ?? 0) || null
      : null,
);
const resolving = ref(false);
const unavailable = ref(false);
/** 不可用的原因：区分"作者下架"与"被新版本取代"，文案不能骗人 */
const unavailableState = ref<'missing' | 'unpublished' | 'replaced'>('missing');
const toUnavailableState = (state?: string): 'missing' | 'unpublished' | 'replaced' =>
   state === 'missing' || state === 'replaced' ? state : 'unpublished';

const resolveTarget = async () => {
   if (import.meta.server) return;
   if (isRecord.value) {
      resolvedPid.value = Number(path.value?.[1] ?? 0);
      return;
   }
   if (target.value.kind === 'invalid') {
      // 地址里的目标不是正整数（例如链接被拼成 NaN / by-base 后面没题号）
      unavailableState.value = 'missing';
      unavailable.value = true;
      resolvedPid.value = null;
      return;
   }

   const { $trpc } = useNuxtApp();
   resolving.value = true;
   unavailable.value = false;
   try {
      if (target.value.kind === 'byBase') {
         // ⚠️ by-base 分支必须放在"pid 合法性"检查**之前**：
         // 这条路径第二段是字符串 'by-base'，被 Number() 转出来是 NaN，
         // 先检查会把所有 by-base 链接都判成"题号有误"（真实发生过的 bug）。
         const found = await $trpc.public.learning.problemByBaseId.query({
            baseId: target.value.baseId,
         });
         if (found?.pid) {
            // 当前版本已发布，或被更新的已发布版本取代：都直接渲染那个版本
            resolvedPid.value = found.pid;
         } else {
            // missing / unpublished：真的没有可做的版本
            unavailableState.value = toUnavailableState(found?.state);
            unavailable.value = true;
            resolvedPid.value = null;
         }
      } else if (target.value.kind === 'direct') {
         // 公开接口按 pid 判可用性：不能用 protected.*（登录态/权限不足会
         // 抛 UNAUTHORIZED，把正常已发布的题也误拦成"无权访问"）
         const info = await $trpc.public.learning.problemByPid.query({
            pid: target.value.pid,
         });
         if (info?.published) {
            resolvedPid.value = info.pid;
         } else if (info?.latestPid) {
            // 贴的是作废版本，但题有更新的已发布版本：直接换成新版本
            resolvedPid.value = info.latestPid;
         } else {
            unavailableState.value = toUnavailableState(info?.state);
            unavailable.value = true;
            resolvedPid.value = null;
         }
      }
   } catch (error) {
      logger.error(error as Error, '解析题目版本失败');
      unavailable.value = true;
      resolvedPid.value = null;
   } finally {
      resolving.value = false;
   }
};

watch([path], () => void resolveTarget(), { immediate: true });

/**
 * 是否真的要渲染编辑器：解析出可用版本后才挂载。
 *
 * 解析期间挂载编辑器，用户会看到深色编辑器闪一下再被替换/跳走
 * —— 观感就是"一闪然后黑了"。
 */
const shouldRenderEditor = computed(
   () => componentLoaded.editor && resolvedPid.value !== null,
);

const componentLoaded = reactive({
   editor: false,
   record: false,
});
const currentComponent = ref<'editor' | 'record'>();

provide('currentComponent', currentComponent);

watch(
   path,
   (newPath) => {
      if (newPath?.[0] === 'editor') {
         componentLoaded.editor = true;
         currentComponent.value = 'editor';
      } else {
         componentLoaded.record = true;
         currentComponent.value = 'record';
      }
   },
   { immediate: true }
);

useSeoMeta({
   title: computed(() => {
      if (currentComponent.value === 'editor') {
         return `题目 #${id.value} - Quanta Challenge`;
      } else {
         return `提交记录 #${id.value} - Quanta Challenge`;
      }
   }),
});
</script>

<template>
   <StSpace fill class="relative">
      <!-- 解析当前版本（by-base → pid / pid → 可用性） -->
      <StSpace
         v-if="resolving"
         fill
         center
         direction="vertical"
         gap="0.75rem"
         class="text-accent-300">
         <span class="st-font-body-bold text-accent-100">正在打开题目…</span>
      </StSpace>

      <!-- 已下架 / 不存在：给出明确说明，而不是把用户弹走 -->
      <StSpace
         v-else-if="unavailable"
         fill
         center
         direction="vertical"
         gap="1rem"
         class="text-accent-300">
         <span class="st-font-body-bold text-error">
            {{
               unavailableState === 'missing'
                  ? '这道题已经不存在了'
                  : '这道题已下架'
            }}
         </span>
         <span class="st-font-caption text-accent-400 max-w-[30rem] text-center">
            {{
               unavailableState === 'missing'
                  ? '作者删除了这道题，或题号有误。'
                  : '作者取消了发布，重新上架后这里会自动恢复。'
            }}
         </span>
         <!-- 硬跳转：走客户端软跳转时题库页会黑屏（要刷新才出来） -->
         <a href="/app/problems">
            <StButton size="sm" bordered>
               <span>返回题库</span>
            </StButton>
         </a>
      </StSpace>

      <TransitionGroup name="fade" mode="out-in">
         <LazyEditor
            v-if="shouldRenderEditor"
            v-show="currentComponent === 'editor'"
            hydrate-on-visible
            :id="resolvedPid!" />
         <LazyRecord
            v-if="componentLoaded.record"
            v-show="currentComponent === 'record'"
            hydrate-on-visible
            :id="resolvedPid!" />
      </TransitionGroup>
   </StSpace>
</template>

<style lang="css" scoped>
.fade-enter-active,
.fade-leave-active {
   transition: all 0.2s ease-in-out;
   position: absolute;
}

.fade-enter-from,
.fade-leave-to {
   opacity: 0;
   transform: translateY(1rem);
}

.fade-enter-to,
.fade-leave-from {
   opacity: 1;
   transform: translateY(0);
}
</style>
