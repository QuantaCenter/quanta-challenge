<script setup lang="ts">
import { Down, PreviewClose, PreviewOpen, Up } from '@icon-park/vue-next';
import type { FormItemStatus } from '../Form/type';

const props = defineProps<{
   password?: boolean;
   disabled?: boolean;
   outerClass?: string | any;
   suffixClass?: string;
   status?: FormItemStatus;
}>();

const visible = ref(false);

// 透传给 <input> 的属性。这里刻意把 `type` 摘掉：
// 模板里既要 v-bind="$attrs" 又要动态决定 type，两者都写 type 就会互相覆盖。
// 而 mergeProps 的语义是「后者胜」，v-bind="$attrs" 写在 :type 之后会让外部传入的
// type="password" 顶掉本组件算出来的值 —— 症状就是密码框的"显示/隐藏"按钮点了没反应
// （注册页正是同时传了 type="password" 和 password，登录页只传 password 所以正常）。
const inputAttrs = computed(() => {
   const { type: _ignored, ...rest } = useAttrs();
   return rest;
});

// 实际渲染的 type：password 模式由可见性开关控制，其它情况沿用外部传入的 type，
// 这样 type="number" 之类的输入框不受影响。
const inputType = computed(() => {
   if (props.password) return visible.value ? 'text' : 'password';
   const t = useAttrs().type;
   return typeof t === 'string' ? t : undefined;
});

const value = defineModel<string | number>('value');
const borderClass = computed(() => {
   return props.status === 'error'
      ? '!border !border-error'
      : props.status === 'success'
        ? '!border !border-success'
        : '';
});

const increaseValue = () => {
   value.value = isNaN(Number(value.value)) ? 0 : Number(value.value) + 1;
};
const decreaseValue = () => {
   value.value = isNaN(Number(value.value)) ? 0 : Number(value.value) - 1;
};
</script>

<template>
   <div
      class="relative text-accent-300 flex items-center gap-3 py-4 px-4 rounded-lg caret-primary selection:bg-secondary/60 transition-colors"
      :class="[outerClass, borderClass]">
      <slot name="prefix"></slot>
      <input
         v-model="value"
         v-bind="inputAttrs"
         :type="inputType"
         :disabled="disabled"
         :class="[
            'bg-transparent border-none outline-none placeholder:text-accent-300 text-white flex-1',
            { '!cursor-not-allowed': disabled },
         ]" />
      <slot name="suffix"></slot>
      <div
         v-if="password"
         :class="['text-2xl hover:cursor-pointer', suffixClass]"
         @click="visible = !visible">
         <PreviewOpen v-if="visible" />
         <PreviewClose v-else />
      </div>
      <div
         v-if="$attrs.type === 'number'"
         class="text-accent-300 flex flex-col items-center absolute right-2.5">
         <div
            @click.prevent="increaseValue"
            class="hover:cursor-pointer hover:bg-accent-600 px-1 rounded-sm transition-colors">
            <Up />
         </div>
         <div
            @click.prevent="decreaseValue"
            class="hover:cursor-pointer hover:bg-accent-600 px-1 rounded-sm transition-colors">
            <Down />
         </div>
      </div>
   </div>
</template>

<style scoped>
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
   -webkit-appearance: none;
}
</style>
