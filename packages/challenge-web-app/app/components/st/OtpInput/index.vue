<script setup lang="ts">
import { sanitizeOtpInput } from './sanitize';

/**
 * 分组验证码输入框（OTP input）。
 *
 * 用于设备授权页输入终端显示的 `XXXX-XXXX` 码。
 *
 * 为什么不用单个 <input>：
 *   1. 设备码是 **base20 × 8 位、按 4 位分组**的格式（RFC 8628 §6.1），
 *      分组展示能让用户逐组与终端核对，漏输/多输一眼可见；
 *   2. 分组输入天然引导"每组 4 个字符"，减少把 `0`/`O` 这类易混字符输错；
 *   3. 支持粘贴整串（含横线、空格）：用户从终端复制时几乎必然带上分隔符，
 *      单个输入框需要额外清洗，分组后只需在 paste 时统一分发。
 *
 * 无障碍：始终只有一个真实输入框获得焦点（外层 input 绝对定位覆盖全部格子），
 * 而不是 8 个独立 input —— 后者在移动端会触发多次弹键盘、且无法整体删除。
 */
const props = withDefaults(
   defineProps<{
      /** 分组长度，设备码是 4 */
      groupSize?: number;
      /** 分组数量，设备码是 2（即 8 位） */
      groupCount?: number;
      disabled?: boolean;
      /** 允许出现的字符，用于清洗输入（默认不限，由父组件校验） */
      alphabet?: string;
      /** 自动聚焦 */
      autofocus?: boolean;
   }>(),
   {
      groupSize: 4,
      groupCount: 2,
      disabled: false,
      autofocus: false,
   },
);

const modelValue = defineModel<string>({ default: '' });

const totalLength = computed(() => props.groupSize * props.groupCount);
const inputRef = ref<HTMLInputElement | null>(null);

/** 只保留字母数字，统一大写；剔除分隔符（横线/空格）与非法字符 */
const sanitize = (raw: string): string =>
   sanitizeOtpInput(raw, {
      alphabet: props.alphabet,
      maxLength: totalLength.value,
   });

const handleInput = (event: Event) => {
   const target = event.target as HTMLInputElement;
   const next = sanitize(target.value);
   modelValue.value = next;
   // 受控回写：用户多输的字符（如第 9 位）必须立刻从 DOM 里抹掉，
   // 否则它会残留在 input 里而模型值没有 —— 表现为"看得见但提交不上"。
   if (target.value !== next) target.value = next;
};

const handlePaste = (event: ClipboardEvent) => {
   const text = event.clipboardData?.getData('text') ?? '';
   if (!text) return;
   // 阻止默认粘贴：默认行为会把整串（含横线）塞进单行 input，
   // 光标位置与分组显示会错乱。统一走 sanitize 后再写回。
   event.preventDefault();
   const next = sanitize(text);
   modelValue.value = next;
   if (inputRef.value) inputRef.value.value = next;
};

const emit = defineEmits<{
   /** 输入满 totalLength 位时触发（便于自动提交/查询） */
   complete: [value: string];
   /** 回车触发 */
   submit: [value: string];
}>();

const handleKeydown = (event: KeyboardEvent) => {
   if (event.key === 'Enter') emit('submit', modelValue.value);
};

// 满位即通知父组件，省掉"输入完还要点继续"的一步
watch(modelValue, (value) => {
   if (value.length === totalLength.value) emit('complete', value);
});

const focus = () => inputRef.value?.focus();
defineExpose({ focus });

onMounted(() => {
   if (props.autofocus) focus();
});

/** 已输入的字符按分组切开，用于逐格渲染 */
const groups = computed(() =>
   Array.from({ length: props.groupCount }, (_, groupIndex) =>
      Array.from({ length: props.groupSize }, (_, index) => {
         const position = groupIndex * props.groupSize + index;
         return modelValue.value[position] ?? '';
      }),
   ),
);

const isActive = ref(false);
/** 当前光标所在格：按已输入长度推进，满了就停在最后一格 */
const activeIndex = computed(() =>
   Math.min(modelValue.value.length, totalLength.value - 1),
);
</script>

<template>
   <div class="relative w-full" @click="focus">
      <!-- 真实的输入框：透明覆盖全部格子，负责接收键盘/输入法/粘贴 -->
      <input
         ref="inputRef"
         :value="modelValue"
         :disabled="disabled"
         type="text"
         inputmode="text"
         autocomplete="one-time-code"
         autocapitalize="characters"
         spellcheck="false"
         :aria-label="`验证码，共 ${totalLength} 位`"
         class="absolute inset-0 w-full h-full opacity-0 cursor-text disabled:cursor-not-allowed"
         @input="handleInput"
         @paste="handlePaste"
         @keydown.enter.prevent="handleKeydown"
         @focus="isActive = true"
         @blur="isActive = false" />

      <div
         class="flex items-center justify-center gap-3"
         :class="{ 'opacity-50': disabled }">
         <template v-for="(group, groupIndex) in groups" :key="groupIndex">
            <!-- 分隔符：与终端显示一致，用户要逐字核对 -->
            <span
               v-if="groupIndex > 0"
               class="text-2xl font-mono text-accent-300 select-none">
               -
            </span>
            <div class="flex gap-2">
               <span
                  v-for="(char, index) in group"
                  :key="index"
                  class="w-10 h-12 flex items-center justify-center rounded-lg border font-mono text-xl transition-colors"
                  :class="[
                     char
                        ? 'border-accent-500 bg-accent-700 text-white'
                        : 'border-accent-600 bg-accent-700/40 text-accent-300',
                     isActive &&
                     groupIndex * groupSize + index === activeIndex
                        ? '!border-primary'
                        : '',
                  ]">
                  {{ char || '' }}
               </span>
            </div>
         </template>
      </div>
   </div>
</template>
