<script setup lang="ts">
const opened = defineModel<boolean>('opened', { required: true });
withDefaults(defineProps<{ label?: string }>(), { label: '搜索' });
const teleported = useClientTeleport();
const emit = defineEmits<{ keydown: [event: KeyboardEvent] }>();
const surface = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;

watch(opened, (value) => {
   if (value) {
      previousFocus = document.activeElement as HTMLElement | null;
   } else {
      previousFocus?.focus();
   }
});

const trapFocus = (event: KeyboardEvent) => {
   emit('keydown', event);
   if (event.key === 'Escape') {
      event.preventDefault();
      opened.value = false;
   }
   if (event.key !== 'Tab') return;
   const elements = Array.from(surface.value?.querySelectorAll<HTMLElement>(
      'input, button, a[href], [tabindex="0"]',
   ) ?? []).filter((element) => !element.hasAttribute('disabled'));
   const first = elements[0];
   const last = elements.at(-1);
   if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
   } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
   }
};
</script>

<template>
   <Teleport to="body">
      <template v-if="teleported">
         <Transition name="search-overlay">
            <div
               v-if="opened"
               class="fixed inset-0 z-[10001] bg-background/50 backdrop-blur-md flex items-start justify-center pt-[min(20vh,8rem)]"
               @click.self="opened = false"
               @keydown="trapFocus">
               <div
                  ref="surface"
                  role="dialog"
                  aria-modal="true"
                  :aria-label="label"
                  class="w-full max-w-[42rem] mx-4"
                  @click.stop>
                  <slot />
               </div>
            </div>
         </Transition>
      </template>
   </Teleport>
</template>

<style scoped>
.search-overlay-enter-active,
.search-overlay-leave-active {
   transition: opacity 0.2s ease;
}
.search-overlay-enter-from,
.search-overlay-leave-to {
   opacity: 0;
}
.search-overlay-enter-active > div,
.search-overlay-leave-active > div {
   transition: transform 0.2s ease, opacity 0.2s ease;
}
.search-overlay-enter-from > div,
.search-overlay-leave-to > div {
   transform: translateY(-1rem);
   opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
   .search-overlay-enter-active,
   .search-overlay-leave-active,
   .search-overlay-enter-active > div,
   .search-overlay-leave-active > div {
      transition: none;
   }
}
</style>
