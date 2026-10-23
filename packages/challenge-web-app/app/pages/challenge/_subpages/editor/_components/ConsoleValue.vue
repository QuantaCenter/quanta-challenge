<script setup lang="ts">
import { RightOne } from '@icon-park/vue-next';
import type { PreviewConsoleValue } from '../../../_composables/use-web-container/preview-console';
import { toDisplayText } from '../_utils/preview-url';

const props = defineProps<{
   value: PreviewConsoleValue;
   top?: boolean;
}>();

const expanded = ref(false);

type CompositeValue = Extract<PreviewConsoleValue, { entries: unknown }>;

const isComposite = (value: PreviewConsoleValue): value is CompositeValue =>
   value.t === 'object' || value.t === 'array' || value.t === 'map' || value.t === 'set';

const brief = (value: PreviewConsoleValue): string => {
   switch (value.t) {
      case 'undefined':
      case 'null':
         return value.t;
      case 'circular':
         return '[Circular]';
      case 'string':
         return JSON.stringify(value.v);
      case 'function':
         return `ƒ ${value.name}()`;
      case 'error':
         return `${value.name}: ${value.message}`;
      case 'object':
      case 'array':
      case 'map':
      case 'set':
         return value.t === 'array'
            ? `${value.name === 'Array' ? '' : value.name}(${value.size})`
            : value.t === 'object'
              ? value.name === 'Object'
                 ? '{…}'
                 : value.name
              : `${value.name}(${value.size})`;
      default:
         return value.v;
   }
};

const summary = computed(() => {
   const value = props.value;
   if (!isComposite(value)) return '';
   const prefix =
      value.t === 'object'
         ? value.name === 'Object'
            ? ''
            : `${value.name} `
         : value.t === 'array' && value.name === 'Array'
           ? `(${value.size}) `
           : `${value.name}(${value.size}) `;
   if (!value.entries) return `${prefix}${value.t === 'array' ? '[…]' : '{…}'}`;
   const parts = value.entries
      .slice(0, 5)
      .map(([key, item]) =>
         value.t === 'array' || value.t === 'set'
            ? brief(item)
            : value.t === 'map'
              ? `${key} => ${brief(item)}`
              : `${key}: ${brief(item)}`,
      );
   if (value.entries.length > 5 || value.more) parts.push('…');
   const [open, close] = value.t === 'array' ? ['[', ']'] : ['{', '}'];
   return `${prefix}${open}${parts.join(', ')}${close}`;
});

const expandable = computed(
   () =>
      (isComposite(props.value) && !!props.value.entries?.length) ||
      (props.value.t === 'error' && !props.top && !!props.value.stack),
);

const errorText = computed(() => {
   if (props.value.t !== 'error') return '';
   const { name, message, stack } = props.value;
   const head = message ? `${name}: ${message}` : name;
   return toDisplayText(stack && stack.includes(message) ? stack : `${head}\n${stack}`);
});
</script>

<template>
   <!-- 插值勿换行，避免 pre-wrap 多出空格 -->
   <span v-if="value.t === 'string'" :class="top ? 'whitespace-pre-wrap' : 'text-[#CE9178]'">{{ top ? value.v : JSON.stringify(value.v) }}</span>
   <span v-else-if="value.t === 'number' || value.t === 'bigint'" class="text-[#B5CEA8]">{{ value.v }}</span>
   <span v-else-if="value.t === 'boolean'" class="text-[#569CD6]">{{ value.v }}</span>
   <span v-else-if="value.t === 'undefined' || value.t === 'null'" class="text-accent-300">{{ value.t }}</span>
   <span v-else-if="value.t === 'symbol' || value.t === 'regexp'" class="text-[#D16969]">{{ value.v }}</span>
   <span v-else-if="value.t === 'date'" class="text-accent-100">{{ value.v }}</span>
   <span v-else-if="value.t === 'node'" class="text-[#4EC9B0]">{{ value.v }}</span>
   <span v-else-if="value.t === 'circular'" class="text-accent-300">[Circular]</span>
   <span v-else-if="value.t === 'function'" class="italic text-[#DCDCAA]" :title="value.v">ƒ {{ value.name || '(anonymous)' }}()</span>
   <span v-else-if="value.t === 'error' && top" class="whitespace-pre-wrap">{{ errorText }}</span>
   <span v-else class="inline-block align-top max-w-full">
      <span
         class="inline-flex items-start gap-0.5"
         :class="{ 'cursor-pointer hover:text-accent-100': expandable }"
         @click="expandable && (expanded = !expanded)">
         <RightOne
            v-if="expandable"
            class="shrink-0 mt-[0.15rem] text-accent-300 transition-transform"
            :class="{ 'rotate-90': expanded }" />
         <span v-if="value.t === 'error'" class="text-red-300">{{ value.name }}: {{ value.message }}</span>
         <span v-else class="italic text-accent-200">{{ summary }}</span>
      </span>
      <span v-if="expanded" class="block pl-4 border-l border-accent-600 ml-1">
         <span v-if="value.t === 'error'" class="block whitespace-pre-wrap text-red-300">{{ errorText }}</span>
         <template v-else-if="isComposite(value)">
            <span v-for="[key, item] in value.entries ?? []" :key="key" class="block">
               <span class="text-[#9CDCFE]">{{ key }}</span>
               <span class="text-accent-300">{{ value.t === 'map' ? ' => ' : ': ' }}</span>
               <ConsoleValue :value="item" />
            </span>
            <span v-if="value.more" class="block text-accent-300">…</span>
         </template>
      </span>
   </span>
</template>
