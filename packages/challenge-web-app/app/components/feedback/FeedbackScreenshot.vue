<script setup lang="ts">
const props = defineProps<{ id: string }>();
const { $trpc } = useNuxtApp();
const url = ref('');
const error = ref(false);
const expanded = ref(false);
const preview = useTemplateRef<HTMLDialogElement>('preview');
let generation = 0;

watch(expanded, async (value) => {
   await nextTick();
   if (value) preview.value?.showModal();
   else preview.value?.close();
});

watch(
   () => props.id,
   async (id) => {
      const current = ++generation;
      url.value = '';
      error.value = false;
      try {
         const result = await $trpc.protected.feedback.screenshot.query({ id });
         if (current === generation) url.value = result.url;
      } catch {
         if (current === generation) error.value = true;
      }
   },
   { immediate: true },
);

onUnmounted(() => {
   generation++;
});
</script>

<template>
   <button
      type="button"
      class="size-20 overflow-hidden rounded-xl border border-accent-500 text-xs text-accent-300 cursor-pointer"
      aria-label="放大反馈截图"
      :disabled="!url"
      @click="expanded = true"
   >
      <img v-if="url" :src="url" alt="反馈截图" class="size-full object-cover">
      <span v-else>{{ error ? '加载失败' : '加载中…' }}</span>
   </button>
   <Teleport to="body">
      <dialog
         ref="preview"
         aria-label="截图预览"
         class="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none items-center justify-center overflow-auto bg-black/90 p-4 text-white open:flex"
         @click.self="expanded = false"
         @cancel="expanded = false"
         @close="expanded = false"
         @keydown.esc="expanded = false"
      >
         <button
            autofocus
            type="button"
            class="fixed top-5 right-5 rounded-lg bg-accent-600 px-4 py-2 text-white cursor-pointer"
            @click="expanded = false"
         >
            关闭
         </button>
         <button
            type="button"
            aria-label="关闭截图预览"
            class="cursor-zoom-out"
            @click="expanded = false"
         >
            <img
               v-if="url"
               :src="url"
               alt="反馈截图完整预览"
               class="max-h-[85dvh] max-w-full object-contain"
            >
         </button>
      </dialog>
   </Teleport>
</template>
