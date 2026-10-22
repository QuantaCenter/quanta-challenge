<script setup lang="ts">
import { Copy, LinkOne } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { useMessage } from '~/components/st/Message/use-message';

/** 快照镜像详情抽屉 */
const props = defineProps<{
   imageId: string | null;
}>();

const emits = defineEmits<{
   edit: [id: string];
   remove: [id: string, name: string];
}>();

const opened = defineModel<boolean>('opened', { default: false });

const { $trpc } = useNuxtApp();
const message = useMessage();

type Detail = Awaited<ReturnType<typeof $trpc.admin.imageBuild.detail.query>>;
const detail = ref<Detail | null>(null);
const loading = ref(false);
const loadError = ref('');

const load = async (id: string) => {
   loading.value = true;
   loadError.value = '';
   detail.value = null;
   try {
      detail.value = await $trpc.admin.imageBuild.detail.query({ id });
   } catch (error) {
      loadError.value = (error as Error)?.message ?? '加载失败';
   } finally {
      loading.value = false;
   }
};

watch(
   () => [opened.value, props.imageId] as const,
   ([isOpened, id]) => {
      if (isOpened && id) void load(id);
   },
   { immediate: true },
);

const buildLines = computed(() => detail.value?.buildFile.split('\n') ?? []);

const fmtSize = (bytes?: number | null) => {
   if (!bytes && bytes !== 0) return '-';
   return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;
};

const copy = async (text: string, tip: string) => {
   try {
      await navigator.clipboard.writeText(text);
      message.success(tip);
   } catch {
      message.error('复制失败', '请手动选择复制');
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="44rem">
      <StSpace direction="vertical" gap="0" class="h-screen text-white" fill>
         <div class="w-full flex-1 overflow-auto p-6">
            <div v-if="loading" class="space-y-4">
               <StSkeletonItem class="h-7 w-[12rem] rounded-md" />
               <StSkeletonItem class="h-4 w-[20rem] rounded-md" />
               <StSkeletonItem class="h-64 w-full rounded-lg" />
            </div>

            <p v-else-if="loadError" class="st-font-body-normal text-error">{{ loadError }}</p>

            <StSpace v-else-if="detail" direction="vertical" gap="1.5rem" fill-x>
               <StSpace direction="vertical" gap="0.5rem" fill-x>
                  <StSpace align="center" gap="0.75rem">
                     <h2 class="st-font-secondary-bold">{{ detail.name }}</h2>
                     <span
                        class="rounded-md px-2 py-0.5 st-font-caption"
                        :class="
                           detail.status === 'ready'
                              ? 'bg-success/15 text-success'
                              : 'bg-accent-500 text-accent-300'
                        ">
                        {{ detail.status === 'ready' ? '可用' : '待上传' }}
                     </span>
                  </StSpace>
                  <button
                     type="button"
                     class="flex items-center gap-1.5 font-mono st-font-caption text-accent-300 hover:text-white transition-colors cursor-pointer"
                     @click="copy(detail.id, '快照镜像 id 已复制')">
                     {{ detail.id }}
                     <Copy size="0.875rem" />
                  </button>
               </StSpace>

               <section class="w-full">
                  <h3 class="st-font-caption tracking-wider text-accent-300 mb-2">备注</h3>
                  <p
                     class="st-font-body-normal whitespace-pre-wrap break-words"
                     :class="detail.description ? 'text-accent-100' : 'text-accent-400'">
                     {{ detail.description || '暂无备注' }}
                  </p>
               </section>

               <section class="w-full">
                  <h3 class="st-font-caption tracking-wider text-accent-300 mb-2">产物</h3>
                  <StSpace gap="2rem" class="st-font-body-normal">
                     <span>
                        <span class="text-accent-300">原始</span>
                        {{ fmtSize(detail.sizeBytes) }}
                     </span>
                     <span>
                        <span class="text-accent-300">压缩后</span>
                        {{ fmtSize(detail.compressedSizeBytes) }}
                     </span>
                     <span>
                        <span class="text-accent-300">更新于</span>
                        {{ dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') }}
                     </span>
                  </StSpace>
               </section>

               <section class="w-full">
                  <StSpace fill-x justify="between" align="center" class="mb-2">
                     <h3 class="st-font-caption tracking-wider text-accent-300">构建文件</h3>
                     <button
                        type="button"
                        class="flex items-center gap-1 st-font-caption text-accent-300 hover:text-white transition-colors cursor-pointer"
                        @click="copy(detail.buildFile, '构建文件已复制')">
                        <Copy size="0.875rem" /> 复制
                     </button>
                  </StSpace>
                  <div
                     class="max-h-[22rem] overflow-auto rounded-lg border border-accent-500 bg-accent-700 py-3 font-mono text-[0.8125rem] leading-relaxed">
                     <div
                        v-for="(line, index) in buildLines"
                        :key="index"
                        class="flex px-3">
                        <span class="w-8 shrink-0 select-none text-right pr-3 text-accent-500">
                           {{ index + 1 }}
                        </span>
                        <span
                           class="whitespace-pre-wrap break-all"
                           :class="line.trim().startsWith('#') ? 'text-accent-400' : 'text-accent-100'">
                           {{ line || ' ' }}
                        </span>
                     </div>
                  </div>
               </section>

               <section class="w-full">
                  <h3 class="st-font-caption tracking-wider text-accent-300 mb-2">
                     使用中的题目（{{ detail.references.length }}）
                  </h3>
                  <p v-if="!detail.references.length" class="st-font-body-normal text-accent-400">
                     暂无题目使用该快照镜像
                  </p>
                  <div v-else class="rounded-lg border border-accent-500 divide-y divide-accent-600">
                     <a
                        v-for="item in detail.references"
                        :key="item.pid"
                        :href="`/challenge/editor/${item.pid}`"
                        target="_blank"
                        class="flex items-center gap-3 px-4 py-2.5 hover:bg-accent-600 transition-colors">
                        <span class="shrink-0 font-mono st-font-caption text-accent-400">
                           #{{ item.pid }}
                        </span>
                        <span class="flex-1 truncate st-font-body-normal text-accent-100">
                           {{ item.title }}
                        </span>
                        <span class="shrink-0 st-font-caption text-accent-400">
                           {{ item.problemType === 'backend_service' ? '后端题' : '前端题' }}
                        </span>
                        <LinkOne size="0.875rem" class="shrink-0 text-accent-400" />
                     </a>
                  </div>
               </section>
            </StSpace>
         </div>

         <StSpace
            v-if="detail"
            justify="between"
            align="center"
            class="w-full border-t border-accent-600 p-4">
            <StButton
               theme="danger"
               bordered
               class="py-[0.375rem] px-[1.25rem] !rounded-[0.5rem]"
               @click="emits('remove', detail.id, detail.name)">
               删除
            </StButton>
            <StButton
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.5rem]"
               @click="emits('edit', detail.id)">
               编辑并重新发布
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
