<script setup lang="ts">
import { useParam } from '~/composables/use-param';
import LazyEditor from './_subpages/editor/index.vue';
import LazyRecord from './_subpages/record/index.vue';
import { logger } from '~~/lib/logger';

definePageMeta({
   layout: 'challenge-layout',
   key: 'challenge-detail',
});

const path = useParam<string[]>('path', {
   required: true,
   onError: () => navigateTo('/app/problems'),
});
const id = computed(() => Number(path.value?.[1] ?? 0));
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
      <TransitionGroup name="fade" mode="out-in">
         <LazyEditor
            v-if="componentLoaded.editor"
            v-show="currentComponent === 'editor'"
            hydrate-on-visible
            :id="id"
            :key="id" />
         <LazyRecord
            v-if="componentLoaded.record"
            v-show="currentComponent === 'record'"
            hydrate-on-visible
            :id="id" />
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
