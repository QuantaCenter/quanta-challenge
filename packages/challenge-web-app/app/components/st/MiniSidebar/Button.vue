<script setup lang="ts">
defineOptions({
   inheritAttrs: false,
});

defineProps<{
   name: string;
}>();
</script>

<template>
   <StSidebarSidePopper :content="name">
      <StRippleEffect>
         <button
            v-bind="$attrs"
            class="size-[2.75rem] max-md:!size-[2.25rem] flex items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors cursor-pointer">
            <slot></slot>
         </button>
      </StRippleEffect>
   </StSidebarSidePopper>
</template>
