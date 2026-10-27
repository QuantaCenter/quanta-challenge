<script setup lang="ts">
import { LoadingFour } from '@icon-park/vue-next';

const props = defineProps<{
   size?: 'default' | 'sm' | 'lg';
   theme?: 'primary' | 'secondary' | 'danger' | 'success';
   bordered?: boolean;
   loading?: boolean;
   type?: 'button' | 'submit';
   text?: string;
   disabled?: boolean;
}>();

const size = computed(() => props.size || 'default');
const theme = computed(() => props.theme || 'primary');
const type = computed(() => props.type || 'button');

const textColorClass = computed(() => {
   if (!props.bordered) {
      return 'text-white';
   }
   switch (theme.value) {
      case 'primary':
         return 'text-primary';
      case 'secondary':
         return 'text-secondary';
      case 'danger':
         return 'text-error';
      case 'success':
         return 'text-success';
      default:
         return 'text-white';
   }
});

const borderedClass = computed(() => {
   if (props.bordered) {
      const base = (() => {
         switch (theme.value) {
            case 'primary':
               return 'border-primary';
            case 'secondary':
               return 'border-secondary';
            case 'danger':
               return 'border-error';
            case 'success':
               return 'border-success';
            default:
               return '';
         }
      })();
      return `border-2 !bg-transparent ${base}`;
   }
   return '';
});
</script>

<template>
   <component
      :is="type === 'button' ? 'button' : 'input'"
      :value="text"
      :disabled="props.disabled || props.loading"
      :type="type === 'button' ? 'button' : 'submit'"
      class="flex items-center justify-center font-bold hover:cursor-pointer hover:opacity-80 transition-all"
      :class="[
         textColorClass,
         borderedClass,
         {
            'py-3 px-5 rounded-[0.5rem]': size === 'default',
            'py-2 px-4 rounded-[0.25rem]': size === 'sm',
            'py-4 px-6 rounded-[0.75rem]': size === 'lg',
            'bg-primary': theme === 'primary',
            'bg-secondary': theme === 'secondary',
            'bg-error': theme === 'danger',
            'bg-success': theme === 'success',
            '!opacity-50 !cursor-wait': loading,
            '!opacity-50 !cursor-not-allowed': disabled,
            'active:scale-95': !disabled,
         },
      ]">
      <slot v-if="$slots.icon" name="icon" :loading="props.loading"></slot>
      <LoadingFour
         v-else-if="props.loading"
         class="mr-2 animate-spin text-lg" />
      <slot></slot>
   </component>
</template>

<style scoped></style>
