<script setup lang="ts">
import type { StSearchOverlayQueryInput } from '#components';
import { useVirtualList } from '@vueuse/core';
import FileIcon from '~/components/st/FileSystemTree/FileIcon.vue';
import { filterProjectFiles } from '~/utils/project-search';

const opened = defineModel<boolean>('opened', { required: true });
const props = defineProps<{ loadFiles: (signal: AbortSignal) => Promise<string[]> }>();
const emit = defineEmits<{ select: [path: string] }>();
const query = ref('');
const paths = ref<string[]>([]);
const busy = ref(false);
const error = ref('');
const selected = ref(0);
const input = ref<InstanceType<typeof StSearchOverlayQueryInput>>();
const filtered = computed(() => filterProjectFiles(paths.value, query.value));
const rowHeight = 44;
const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(filtered, {
   itemHeight: rowHeight,
   overscan: 6,
});
const containerHeight = computed(() => Math.max(80, Math.min(360, filtered.value.length * rowHeight)));
let controller: AbortController | undefined;

watch(opened, async (value) => {
   controller?.abort();
   if (!value) return;
   query.value = '';
   selected.value = 0;
   paths.value = [];
   error.value = '';
   busy.value = true;
   const request = new AbortController();
   controller = request;
   await nextTick();
   input.value?.focus();
   try {
      const files = await props.loadFiles(request.signal);
      if (!request.signal.aborted) paths.value = files;
   } catch {
      if (!request.signal.aborted) error.value = '无法读取项目文件，请稍后重试';
   } finally {
      if (!request.signal.aborted) busy.value = false;
   }
});
onUnmounted(() => controller?.abort());
watch([query, opened], async () => {
   selected.value = 0;
   await nextTick();
   scrollTo(0);
});

const revealSelected = () => {
   const container = containerProps.ref.value;
   if (!container) return;
   const top = selected.value * rowHeight;
   if (top < container.scrollTop) scrollTo(selected.value);
   else if (top + rowHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = top + rowHeight - container.clientHeight;
      containerProps.onScroll();
   }
};

const choose = (path?: string) => {
   if (!path) return;
   opened.value = false;
   emit('select', path);
};
const handleKeydown = (event: KeyboardEvent) => {
   if (event.isComposing) return;
   if (event.key === 'Enter') {
      event.preventDefault();
      choose(filtered.value[selected.value]);
   } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const length = filtered.value.length;
      if (!length) return;
      selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + length) % length;
      revealSelected();
   }
};
</script>

<template>
   <StSearchOverlayShell v-model:opened="opened" label="搜索项目文件" @keydown="handleKeydown">
      <div class="flex flex-col gap-3">
         <StSearchOverlayQueryInput
            ref="input"
            v-model="query"
            :busy="busy"
            placeholder="输入文件名或路径，搜索项目文件…" />
         <div
            class="bg-accent-700 rounded-xl border border-accent-600 overflow-hidden transition-[height] duration-300"
            :style="{ height: containerHeight + 'px', maxHeight: '45vh' }">
            <div v-bind="containerProps" class="h-full overflow-y-auto" role="listbox" aria-label="项目文件">
               <div v-if="busy || error || !filtered.length" class="p-6 text-center text-accent-300" role="status">
                  {{ busy ? '正在读取项目文件…' : error || '未找到匹配文件' }}
               </div>
               <div v-else v-bind="wrapperProps">
                  <button
                     v-for="{ data: path, index } in list"
                     :key="path"
                     type="button"
                     role="option"
                     :aria-selected="index === selected"
                     class="w-full text-left flex items-center gap-3 px-4 text-accent-100 hover:bg-accent-600"
                     :style="{ height: rowHeight + 'px' }"
                     :class="{ 'bg-accent-600': index === selected }"
                     @mouseenter="selected = index"
                     @click="choose(path)">
                     <FileIcon :name="path" aria-hidden="true" />
                     <span class="min-w-0 truncate text-sm" :title="path.replace(/^\/project\//, '')">{{ path.replace(/^\/project\//, '') }}</span>
                  </button>
               </div>
            </div>
         </div>
         <div class="flex justify-between text-xs text-accent-300 px-2">
            <span>↑ ↓ 导航 · Enter 打开 · Esc 关闭</span>
            <span>{{ filtered.length }} 个文件</span>
         </div>
      </div>
   </StSearchOverlayShell>
</template>
