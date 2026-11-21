<script setup lang="ts">
import { dialog } from '~/composables/use-dialog';
import { Settings, RefreshCw, Unplug } from 'lucide-vue-next';
const props = withDefaults(
   defineProps<{
      target?: 'workshop' | 'settings';
   }>(),
   {
      target: 'settings',
   },
);
const emit = defineEmits<{
   changed: [];
}>();
const { $trpc } = useNuxtApp();
const { data, error, refresh } = await useAsyncData('github-connection', () =>
   $trpc.protected.github.status.query(),
);
const pending = ref(false);
const failure = ref('');
const route = useRoute();
const connected = computed(() => data.value?.enabled && data.value.connected);
const status = computed(() => {
   if (!data.value) return '';
   if (!data.value.enabled) return '授权未启用';
   if (connected.value) return '已连接';
   return data.value.login ? '已失效' : '未连接';
});
const notice = computed(() => {
   if (failure.value) return failure.value;
   if (route.query.github === 'failed') return '授权未完成，请重试。';
   return error.value ? '连接状态加载失败。' : '';
});
const iconButtonClass =
   '!size-8 !rounded-lg !bg-transparent !p-0 !text-accent-300 hover:!bg-accent-500 max-md:!size-9';

let redirecting = false;
const resetPending = () => {
   pending.value = false;
   redirecting = false;
};
onMounted(() => window.addEventListener('pageshow', resetPending));
onBeforeUnmount(() => window.removeEventListener('pageshow', resetPending));
const run = async (action: 'connect' | 'install' | 'disconnect') => {
   if (pending.value) {
      return;
   }
   if (
      action === 'disconnect' &&
      !(await dialog.confirm({
         title: '解绑 GitHub？',
         description: '已有项目会保留。此操作不会卸载 GitHub App。',
         confirmText: '解绑',
      }))
   ) {
      return;
   }
   pending.value = true;
   failure.value = '';
   try {
      if (action === 'disconnect') {
         await $trpc.protected.github.disconnect.mutate();
         await refresh();
         emit('changed');
      } else {
         const result =
            action === 'connect'
               ? await $trpc.protected.github.connect.mutate({
                    target: props.target,
                 })
               : await $trpc.protected.github.install.mutate({
                    target: props.target,
                 });
         redirecting = true;
         await navigateTo(result.url, {
            external: true,
         });
      }
   } catch (e) {
      redirecting = false;
      failure.value = e instanceof Error ? e.message : '操作失败，请重试';
   } finally {
      if (!redirecting) {
         pending.value = false;
      }
   }
};
</script>

<template>
   <StCard
      role="region"
      aria-label="GitHub 账号连接"
      class="!h-auto min-w-0 !rounded-xl border gap-2 max-md:!p-3"
      :class="connected ? '!border-success/40 !bg-success/5' : 'border-accent-500'">
      <template #header>
         <div class="flex min-w-0 items-center gap-2.5">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-500 max-md:size-8">
               <img src="/icons/github-white.png" alt="" class="size-5 object-contain" />
            </div>
            <div class="min-w-0 flex-1">
               <h3 class="font-bold leading-tight">GitHub</h3>
               <p
                  v-if="status"
                  class="mt-0.5 flex min-w-0 items-center gap-1 whitespace-nowrap text-sm max-md:text-xs"
                  :class="connected ? 'text-success' : 'text-accent-300'">
                  <span class="shrink-0">{{ status }}</span>
                  <span v-if="data?.login" class="min-w-0 truncate" :title="`@${data.login}`">
                     <span aria-hidden="true">· </span>@{{ data.login }}
                  </span>
               </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
               <StButton
                  v-if="!data?.connected"
                  size="sm"
                  :aria-label="data?.login ? '重新授权' : '连接 GitHub'"
                  class="whitespace-nowrap !rounded-lg !bg-accent-100 !px-3 !text-black text-sm"
                  :disabled="!data?.enabled"
                  :loading="pending"
                  @click="run('connect')">
                  {{ data?.login ? '重新授权' : '连接' }}
               </StButton>
               <template v-else>
                  <StPopover content="仓库授权" placement="top" :z-index="10002">
                     <StButton
                        size="sm"
                        aria-label="管理仓库授权"
                        :class="iconButtonClass"
                        :disabled="pending || !data?.enabled"
                        @click="run('install')">
                        <Settings :size="18" aria-hidden="true" />
                     </StButton>
                  </StPopover>
                  <StPopover content="重新授权" placement="top" :z-index="10002">
                     <StButton
                        size="sm"
                        aria-label="重新授权"
                        :class="iconButtonClass"
                        :disabled="pending || !data?.enabled"
                        @click="run('connect')">
                        <RefreshCw :size="18" aria-hidden="true" />
                     </StButton>
                  </StPopover>
               </template>
               <StPopover v-if="data?.login" content="解绑 GitHub" placement="top" :z-index="10002">
                  <StButton
                     size="sm"
                     aria-label="解绑 GitHub"
                     :class="iconButtonClass"
                     :disabled="pending"
                     @click="run('disconnect')">
                     <Unplug :size="18" aria-hidden="true" />
                  </StButton>
               </StPopover>
            </div>
         </div>
      </template>
      <p v-if="notice" role="alert" class="wrap-break-word text-sm text-red-400 max-md:text-xs">
         {{ notice }}
      </p>
   </StCard>
</template>
