<script setup lang="ts">
import { Code } from '@icon-park/vue-next';
import LazyScriptEditingDrawer from '../_drawers/ScriptEditingDrawer.vue';

const props = defineProps<{
   problemType?: 'frontend' | 'backend_service';
}>();

const ready = ref(false);
const isEditing = ref(false);
const script = defineModel<string>('script', { default: '' });
</script>

<template>
   <LazyScriptEditingDrawer
      hydrate-on-visible
      v-model:opened="isEditing"
      v-model:script="script"
      :problem-type="props.problemType" />
   <div
      class="p-[0.375rem] pb-4 border border-accent-300 rounded-lg flex flex-col items-center gap-3">
      <div
         class="p-4 rounded-[0.25rem] bg-accent-600 w-full max-h-[60vh] overflow-auto">
         <StCodePreview
            v-show="ready && script"
            @ready="ready = true"
            :code="script" />
         <div
            v-show="!ready || !script"
            class="st-font-caption text-accent-200 text-[0.875rem]">
            暂无判题脚本
         </div>
      </div>
      <div
         @click="isEditing = true"
         class="flex gap-2 text-accent-100 font-bold items-center hover:text-primary transition-colors hover:cursor-pointer">
         <Code class="text-[1.25rem]" />
         点击进入编辑
      </div>
   </div>
</template>
