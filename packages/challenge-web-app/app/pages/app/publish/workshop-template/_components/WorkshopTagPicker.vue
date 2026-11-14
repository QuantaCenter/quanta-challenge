<script setup lang="ts">
import { CloseSmall, Plus } from '@icon-park/vue-next';
import type { ISelectOption } from '~/components/st/Select/type';
import { useMessage } from '~/components/st/Message/use-message';
import TagEditingDrawer from '~/components/tag/TagEditingDrawer.vue';
import TechTagIcon from '../../../workshop/_components/TechTagIcon.vue';

/** 工坊模板的技术栈标签：从可用的工坊标签（内置 + 已发布）中多选，也可以就地新建 */

const props = defineProps<{
   outerClass?: string;
   /** 最多选择的标签数 */
   max?: number;
}>();

const tags = defineModel<string[]>('tags', { default: () => [] });

const { $trpc } = useNuxtApp();
const message = useMessage();

type WorkshopTagItem = Awaited<ReturnType<typeof $trpc.admin.tag.workshopList.query>>[number];
const available = ref<WorkshopTagItem[]>([]);
const loading = ref(false);
const loaded = ref(false);

const fetchTags = async () => {
   loading.value = true;
   try {
      available.value = await $trpc.admin.tag.workshopList.query();
      loaded.value = true;
   } catch (error) {
      message.error('工坊标签加载失败', (error as Error)?.message ?? '请稍后重试');
   } finally {
      loading.value = false;
   }
};
onMounted(fetchTags);

const tagMap = computed(() => new Map(available.value.map((tag) => [tag.name, tag])));

const options = computed<ISelectOption[]>(() =>
   available.value.map((tag) => ({
      label: tag.name,
      value: tag.name,
      imageUrl: tag.icon ?? undefined,
      description: tag.templateCount ? `${tag.templateCount} 个模板` : undefined,
   })),
);

/** 已选但不在可用列表中的标签（例如被删除的标签），保存时会被拒绝 */
const isMissing = (name: string) => loaded.value && !tagMap.value.has(name);

const limit = computed(() => props.max ?? 8);
watch(tags, (value) => {
   if (value.length <= limit.value) return;
   tags.value = value.slice(0, limit.value);
   message.warning(`最多选择 ${limit.value} 个标签`);
});

const removeTag = (name: string) => {
   tags.value = tags.value.filter((tag) => tag !== name);
};

const selectOpened = ref(false);
const creating = ref(false);
const openCreate = () => {
   selectOpened.value = false;
   creating.value = true;
};
const onCreated = async () => {
   await fetchTags();
   selectOpened.value = true;
};
</script>

<template>
   <TagEditingDrawer v-model:opened="creating" scope="workshop" @saved="onCreated" />
   <StSelect
      v-model:value="tags"
      v-model:opened="selectOpened"
      attach-to-body
      multiple
      close-on-click-outside
      placeholder="选择技术栈标签"
      option-empty-text="暂无工坊标签"
      :loading="loading"
      :max-container-height="320"
      options-container-class="overflow-y-auto!"
      :outer-class="props.outerClass"
      :options="options">
      <template #selected-preview="{ value }">
         <div class="flex w-full flex-wrap gap-2">
            <span
               v-for="name in value as string[]"
               :key="name"
               class="inline-flex h-7 items-center gap-1.5 rounded-md pl-2 pr-1 text-xs font-medium"
               :class="isMissing(name) ? 'bg-error/15 text-error' : 'bg-accent-500/60 text-accent-200'"
               :title="isMissing(name) ? '该标签已不存在，请移除' : undefined"
               @click.stop>
               <TechTagIcon :name="name" :icon="tagMap.get(name)?.icon ?? undefined" />
               <span class="whitespace-nowrap">{{ name }}</span>
               <button
                  type="button"
                  :aria-label="`移除标签 ${name}`"
                  class="flex size-5 items-center justify-center rounded hover:bg-white/15 cursor-pointer"
                  @click.stop="removeTag(name)">
                  <CloseSmall />
               </button>
            </span>
         </div>
      </template>
      <template #options-after>
         <div class="flex w-full justify-center border-t border-accent-600 pt-1">
            <button
               type="button"
               class="flex h-8 items-center gap-1 st-font-caption text-primary cursor-pointer hover:opacity-75 transition-opacity"
               @click.stop="openCreate">
               <Plus />
               新建工坊标签
            </button>
         </div>
      </template>
      <template #options-empty>
         <div class="flex h-10 items-center justify-center gap-1 text-sm text-accent-300">
            暂无工坊标签，
            <button
               type="button"
               class="st-font-caption text-primary underline underline-offset-3 cursor-pointer hover:opacity-75"
               @click.stop="openCreate">
               去添加
            </button>
         </div>
      </template>
   </StSelect>
</template>
