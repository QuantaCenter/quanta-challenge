<script setup lang="ts">
import type { ISelectOption } from '~/components/st/Select/type';
import TagEditingDrawer from '~/components/tag/TagEditingDrawer.vue';
import { Plus, RobotOne } from '@icon-park/vue-next';

const { $trpc } = useNuxtApp();

const tags = defineModel<number[]>('tags', { default: [] });

const props = defineProps<{
   outerClass?: string;
}>();

const tagOptions = ref<(ISelectOption & { color: string })[]>([]);
const tagValueToLabel = (value: string) => {
   const option = tagOptions.value.find((option) => option.value === value);
   return option ? option.label : value;
};
const tagValueToColor = (value: string) => {
   const option = tagOptions.value.find((option) => option.value === value);
   return option ? option.color : '#FA7C0E';
};

const handleRemoveTag = (tag: number) => {
   tags.value = tags.value.filter((t) => t !== tag);
};

const tagSelectOpened = ref(false);
const fetchTagLoading = ref(false);
const fetchTags = async (): Promise<(ISelectOption & { color: string })[]> => {
   const tags = await $trpc.public.tag.list.query();
   return tags
      .map((tag) => ({
         label: tag.name,
         value: tag.tid,
         color: tag.color ?? '#FA7C0E',
         imageUrl: tag.url ? `http://localhost:3000${tag.url}` : undefined,
      }))
      .toSorted((a, b) =>
         a.label.localeCompare(b.label)
      ) satisfies ISelectOption[];
};

onMounted(async () => {
   if (tags.value.length > 0) {
      tagOptions.value = await fetchTags();
   }
});

watch(tagSelectOpened, async (opened) => {
   if (!opened || tagOptions.value.length > 0) return;
   fetchTagLoading.value = true;
   tagOptions.value = await atLeastTime(400, fetchTags());
   fetchTagLoading.value = false;
});

const tagEditing = ref(false);

const onTagSaved = async () => {
   tagEditing.value = false;
   tagSelectOpened.value = true;
   tagOptions.value = await fetchTags();
};
</script>

<template>
   <TagEditingDrawer v-model:opened="tagEditing" @saved="onTagSaved" />
   <StSelect
      v-model:value="tags"
      v-model:opened="tagSelectOpened"
      attach-to-body
      placeholder="请选择题目标签"
      multiple
      close-on-click-outside
      :loading="fetchTagLoading"
      :outer-class="props.outerClass"
      :options="tagOptions">
      <template #options-empty>
         <div
            class="w-fit mx-auto flex justify-center text-sm text-accent-300 h-10 items-center relative">
            <RobotOne class="text-base absolute -left-5" />
            <StSpace no-wrap no-shrink gap="0">
               暂时没有题目标签，
               <div
                  @click="tagEditing = !tagEditing"
                  :class="[
                     'st-font-caption text-primary underline underline-offset-3',
                     'cursor-pointer hover:opacity-75 transition-opacity',
                  ]">
                  去添加
               </div>
            </StSpace>
         </div>
      </template>
      <template #selected-preview="{ value }">
         <div class="flex gap-2 flex-wrap w-full">
            <StTag
               v-for="tag in value"
               closable
               :key="tag"
               :content="tagValueToLabel(tag)"
               :color="tagValueToColor(tag)"
               @click.stop
               @close="handleRemoveTag(tag)" />
         </div>
      </template>
      <template #options-after>
         <div class="flex justify-center border-t border-accent-600 w-full">
            <div
               class="mx-auto flex justify-center text-sm text-accent-300 h-8 pt-1 items-center relative">
               <StSpace
                  no-wrap
                  no-shrink
                  gap="0"
                  align="center"
                  @click="tagEditing = !tagEditing"
                  :class="[
                     'st-font-caption text-primary',
                     'cursor-pointer hover:opacity-75 transition-opacity',
                  ]">
                  <Plus class="text-base absolute -left-5" />
                  添加新标签
               </StSpace>
            </div>
         </div>
      </template>
   </StSelect>
</template>
