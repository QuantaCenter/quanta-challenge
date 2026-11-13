<script setup lang="ts">
import { dialog } from '~/composables/use-dialog';
import { LoadingFour } from '@icon-park/vue-next';
import { Settings, RefreshCw, Unplug } from 'lucide-vue-next';
const props = withDefaults(defineProps<{ target?: 'lab' | 'settings' }>(), { target: 'settings' });
const emit = defineEmits<{ changed: [] }>();
const { $trpc } = useNuxtApp();
const { data, error, refresh } = await useAsyncData('github-connection', () => $trpc.protected.github.status.query());
const pending = ref(false);
const failure = ref('');
const route = useRoute();
let redirecting = false;
const resetPending = () => { pending.value = false; redirecting = false; };
onMounted(() => window.addEventListener('pageshow', resetPending));
onBeforeUnmount(() => window.removeEventListener('pageshow', resetPending));
const run = async (action: 'connect' | 'install' | 'disconnect') => {
   if (pending.value) return;
   if (action === 'disconnect' && !await dialog.confirm({ title: '解绑 GitHub？', description: '已有项目会保留。此操作不会卸载 GitHub App。', confirmText: '解绑' })) return;
   pending.value = true;
   failure.value = '';
   try {
      if (action === 'disconnect') {
         await $trpc.protected.github.disconnect.mutate();
         await refresh();
         emit('changed');
      } else {
         const result = action === 'connect'
            ? await $trpc.protected.github.connect.mutate({ target: props.target })
            : await $trpc.protected.github.install.mutate({ target: props.target });
         redirecting = true;
         await navigateTo(result.url, { external: true });
      }
   } catch (e) { redirecting = false; failure.value = e instanceof Error ? e.message : '操作失败，请重试'; }
   finally { if (!redirecting) pending.value = false; }
};
</script>

<template>
   <StCard class="!h-auto !rounded-xl border border-accent-500 gap-3">
      <template #header><span class="sr-only">GitHub 账号连接</span></template>
      <div class="flex items-center justify-between gap-3 flex-wrap">
         <div>
            <h3 class="font-bold">GitHub</h3>
            <p class="text-sm text-accent-300">{{ data?.connected ? `已连接 @${data.login}` : data?.login ? `@${data.login} 需要重新授权` : '连接 GitHub，选择已授权的公开或私有仓库导入。' }}</p>
         </div>
         <div class="flex flex-wrap" :class="target === 'lab' ? 'gap-1' : 'gap-2'">
            <StButton
               v-if="!data?.connected"
               size="sm"
               :bordered="target !== 'lab'"
               :class="target === 'lab' ? 'gap-2 border-2 border-transparent !bg-accent-100 !text-black' : undefined"
               :disabled="pending || !data?.enabled"
               :loading="pending"
               @click="run('connect')">
               <template v-if="target === 'lab'" #icon="{ loading }">
                  <LoadingFour v-if="loading" class="size-4 animate-spin" aria-hidden="true" />
                  <img v-else src="/icons/github.png" alt="" aria-hidden="true" class="size-4 object-contain" />
               </template>
               连接 GitHub
            </StButton>
            <template v-if="target === 'lab'">
               <StPopover v-if="data?.connected" content="安装 / 管理仓库授权" placement="top" :z-index="10002">
                  <template #popper>
                     <div class="px-2 py-1 rounded-lg bg-black text-white border border-accent-500 shadow-lg">安装 / 管理仓库授权</div>
                  </template>
                  <StButton size="sm" aria-label="安装 / 管理仓库授权" class="!size-8 !p-0 !bg-transparent !text-accent-300" :disabled="pending" @click="run('install')">
                     <Settings :size="18" aria-hidden="true" />
                  </StButton>
               </StPopover>
               <StPopover v-if="data?.connected" content="重新授权" placement="top" :z-index="10002">
                  <template #popper>
                     <div class="px-2 py-1 rounded-lg bg-black text-white border border-accent-500 shadow-lg">重新授权</div>
                  </template>
                  <StButton size="sm" aria-label="重新授权" class="!size-8 !p-0 !bg-transparent !text-accent-300" :disabled="pending || !data?.enabled" @click="run('connect')">
                     <RefreshCw :size="18" aria-hidden="true" />
                  </StButton>
               </StPopover>
               <StPopover v-if="data?.login" content="解绑 GitHub" placement="top" :z-index="10002">
                  <template #popper>
                     <div class="px-2 py-1 rounded-lg bg-black text-white border border-accent-500 shadow-lg">解绑 GitHub</div>
                  </template>
                  <StButton size="sm" aria-label="解绑 GitHub" class="!size-8 !p-0 !bg-transparent !text-accent-300" :disabled="pending" @click="run('disconnect')">
                     <Unplug :size="18" aria-hidden="true" />
                  </StButton>
               </StPopover>
            </template>
            <template v-else>
               <StButton v-if="data?.connected" size="sm" bordered :disabled="pending" @click="run('install')">安装 / 管理仓库授权</StButton>
               <StButton v-if="data?.connected" size="sm" bordered :disabled="pending || !data?.enabled" @click="run('connect')">重新授权</StButton>
               <StButton v-if="data?.login" size="sm" bordered :disabled="pending" @click="run('disconnect')">解绑</StButton>
            </template>
         </div>
      </div>
      <p v-if="data && !data.enabled" class="text-sm text-accent-300">管理员尚未配置 GitHub App，仍可通过公开仓库链接导入。</p>
      <p v-if="route.query.github === 'failed'" role="alert" class="text-sm text-red-400">GitHub 授权未完成，请确认仍登录 Challenge 后重试；若账号已绑定其他用户，请先解绑。</p>
      <p v-if="failure || error" role="alert" class="text-sm text-red-400">{{ failure || '连接状态加载失败' }}</p>
   </StCard>
</template>
