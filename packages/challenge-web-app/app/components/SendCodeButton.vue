<script setup lang="ts">
import { Check, LoadingFour } from '@icon-park/vue-next';

const props = defineProps<{
   interval: number;
   disabled: boolean;
   loading?: boolean;
   verified?: boolean;
}>();

const emit = defineEmits<{
   send: [];
}>();

const couldSend = computed(() => countdown.value === 0 && !props.disabled);

const countdown = ref(0);
const handleSendCode = () => {
   if (couldSend.value) {
      emit('send');
      countdown.value = props.interval || 60;
      const timer = setInterval(() => {
         countdown.value -= 1;
         if (countdown.value <= 0) {
            clearInterval(timer);
            countdown.value = 0;
         }
      }, 1000);
   }
};
</script>

<template>
   <div class="relative flex items-center justify-center">
      <div
         @click="handleSendCode()"
         :class="[
            'pl-2 h-6 min-w-8 right-0 st-font-caption rounded-sm flex items-center justify-center whitespace-nowrap shrink-0',
            couldSend
               ? 'text-primary/90 cursor-pointer '
               : 'text-accent-400 cursor-not-allowed',
         ]">
         <LoadingFour v-if="loading" class="animate-spin" />
         <Check v-else-if="verified" class="text-success" />
         <span v-else>
            <template v-if="countdown > 0">
               <span class="hidden sm:inline">重新发送 </span>({{ countdown }}s)
            </template>
            <template v-else>获取验证码</template>
         </span>
      </div>
   </div>
</template>
