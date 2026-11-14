<script setup lang="ts">
import type { DefineComponent } from 'vue';
import { Plus } from '@icon-park/vue-next';
import { WORKSHOP_CATEGORY_FALLBACK } from '@challenge/shared/workshop-templates';
import { useMessage } from '~/components/st/Message/use-message';
import { workshopCategoryIcon } from '~/utils/workshop-category-icons';
import WorkshopCategoryEditingDrawer from '~/components/tag/WorkshopCategoryEditingDrawer.vue';

/** 工坊模板的分类：从启用的模板分类中单选，也可以就地新建 */

defineProps<{ outerClass?: string }>();

const category = defineModel<string>('category', { default: '' });

const { $trpc } = useNuxtApp();
const message = useMessage();

type CategoryItem = Awaited<ReturnType<typeof $trpc.admin.workshopCategory.list.query>>[number];
const categories = ref<CategoryItem[]>([]);
const loading = ref(false);
const loaded = ref(false);

const fetchCategories = async () => {
   loading.value = true;
   try {
      categories.value = await $trpc.admin.workshopCategory.list.query();
      loaded.value = true;
   } catch (error) {
      message.error('模板分类加载失败', (error as Error)?.message ?? '请稍后重试');
   } finally {
      loading.value = false;
   }
};
onMounted(fetchCategories);

// 未选择时默认选中第一个启用的分类
watch(loaded, (isLoaded) => {
   if (!isLoaded || category.value) return;
   const first = categories.value.find((item) => item.enabled);
   if (first) category.value = first.id;
});

const selected = computed(() => categories.value.find((item) => item.id === category.value));

/** 选项只包含启用的分类；已选分类被停用时仍保留在选项中，便于识别 */
const options = computed(() =>
   categories.value
      .filter((item) => item.enabled || item.id === category.value)
      .map((item) => ({
         label: item.enabled ? item.name : `${item.name}（已停用）`,
         value: item.id,
         icon: workshopCategoryIcon(item.icon),
         description: item.description || undefined,
      })),
);

const status = computed(() => {
   if (!loaded.value || !category.value) return null;
   if (!selected.value) return '所选分类已被删除，请重新选择';
   if (!selected.value.enabled) return '所选分类已停用，模板仍可保存，但不会出现在该分类的筛选页签中';
   return null;
});

const selectOpened = ref(false);
const creating = ref(false);
const openCreate = () => {
   selectOpened.value = false;
   creating.value = true;
};
const onCreated = async (id: string) => {
   await fetchCategories();
   category.value = id;
};
</script>

<template>
   <WorkshopCategoryEditingDrawer v-model:opened="creating" @saved="onCreated" />
   <StSpace direction="vertical" gap="0.5rem" fill-x>
      <StSelect
         v-model:value="category"
         v-model:opened="selectOpened"
         attach-to-body
         placeholder="选择模板分类"
         option-empty-text="暂无模板分类"
         :loading="loading"
         :max-container-height="320"
         options-container-class="overflow-y-auto!"
         :outer-class
         :options="options">
         <template #selected-preview>
            <StSpace v-if="category" align="center" gap="0.5rem">
               <Component
                  :is="workshopCategoryIcon(selected?.icon) as DefineComponent"
                  :style="{ color: selected?.color ?? WORKSHOP_CATEGORY_FALLBACK.color }" />
               <StTag
                  size="small"
                  contrast-text
                  :color="selected?.color ?? WORKSHOP_CATEGORY_FALLBACK.color"
                  :content="selected?.name ?? WORKSHOP_CATEGORY_FALLBACK.name" />
            </StSpace>
         </template>
         <template #options-after>
            <div class="flex w-full justify-center border-t border-accent-600 pt-1">
               <button
                  type="button"
                  class="flex h-8 items-center gap-1 st-font-caption text-primary cursor-pointer hover:opacity-75 transition-opacity"
                  @click.stop="openCreate">
                  <Plus />
                  新建模板分类
               </button>
            </div>
         </template>
         <template #options-empty>
            <div class="flex h-10 items-center justify-center gap-1 text-sm text-accent-300">
               暂无模板分类，
               <button
                  type="button"
                  class="st-font-caption text-primary underline underline-offset-3 cursor-pointer hover:opacity-75"
                  @click.stop="openCreate">
                  去添加
               </button>
            </div>
         </template>
      </StSelect>
      <p v-if="status" class="st-font-caption" :class="selected ? 'text-warning' : 'text-error'">
         {{ status }}
      </p>
   </StSpace>
</template>
