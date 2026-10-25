<script setup lang="ts">
import {
   assignFormItemKey,
   type FormItemStatus,
   type IAssignFormItemOptions,
} from './type';

const props = defineProps<{
   name: string;
   errorMessage?: string;
   successMessage?: string;
   label?: string;
   required?: boolean;
}>();

const assignMethod = inject<(options: IAssignFormItemOptions) => void>(
   assignFormItemKey,
   () => void 0
);

const status = ref<FormItemStatus>('default');

onMounted(() => {
   assignMethod({
      name: props.name,
      setStatus: (s) => (status.value = s),
   });
});
</script>

<template>
   <div class="flex flex-col gap-2 w-full">
      <div v-if="props.label" class="w-full flex justify-between flex-wrap gap-x-4 gap-y-2">
         <div class="st-font-body-bold mb-1">
            <span v-if="props.required" class="text-error">*</span>
            {{ props.label }}
         </div>
         <slot name="header-right"></slot>
      </div>
      <slot v-bind="$attrs" :status="status"></slot>
      <div
         v-if="errorMessage && status === 'error'"
         class="text-error text-xs ml-2 st-shaking"
         :class="{ 'mt-2': $slots.prefix }">
         {{ errorMessage }}
      </div>
      <div
         v-if="successMessage && status === 'success'"
         class="text-success text-xs ml-2 st-shaking"
         :class="{ 'mt-2': $slots.prefix }">
         {{ successMessage }}
      </div>
   </div>
</template>

<style lang="css" scoped>
@keyframes shaking {
   0% {
      transform: translateX(0) scaleY(0);
   }
   25% {
      transform: translateX(-5px) scaleY(1);
   }
   50% {
      transform: translateX(5px);
   }
   75% {
      transform: translateX(-5px);
   }
   100% {
      transform: translateX(0);
   }
}

.st-shaking {
   animation: shaking 0.3s ease-in-out;
}
</style>
