<script setup lang="ts">
import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from '../_configs';
import {
   shortcutActions,
   useEditorKeybindings,
   keyFromEvent,
   shortcutRecording,
   defaultKeybindings,
} from '../_composables/editor-keybindings';
import { useKeyboardCapture } from '../_composables/use-keyboard-capture';
import { Close } from '@icon-park/vue-next';
import { RotateCcw, Mic, CircleCheck } from 'lucide-vue-next';

const props = defineProps<{
   config: EditorConfig;
}>();

const emit = defineEmits<{
   'update:config': [config: EditorConfig];
}>();

const opened = defineModel<boolean>('opened', {
   default: false,
});

const tab = ref('settings');
const bindings = useEditorKeybindings();
const isMac = ref(false);
const resetConflict = ref<{ id: string; label: string } | null>(null);

onMounted(() => {
   isMac.value = /Mac|iPhone|iPad/.test(navigator.platform);
});

const displayKey = (key = '') =>
   key
      .split('+')
      .map((part) =>
         part === 'Mod' ? (isMac.value ? 'Command' : 'Control') : part,
      )
      .join(' + ');

const reset = (id: string) => {
   const defaultKey = defaultKeybindings[id];
   const occupied = shortcutActions.find(
      (action) => action.id !== id && bindings.value[action.id] === defaultKey,
   );
   stop();
   if (occupied) {
      resetConflict.value = { id, label: occupied.label };
      return;
   }
   resetConflict.value = null;
   bindings.value = { ...bindings.value, [id]: defaultKey! };
};

const recording = ref<string | null>(null);
const candidate = ref('');

const conflict = computed(() => {
   if (!candidate.value) return undefined;
   return shortcutActions.find(
      (action) =>
         action.id !== recording.value &&
         bindings.value[action.id] === candidate.value,
   );
});

const update = (patch: Partial<EditorConfig>) =>
   emit('update:config', {
      ...DEFAULT_EDITOR_CONFIG,
      ...props.config,
      ...patch,
   });

const updateNumber = (
   key: 'fontSize' | 'tabSize' | 'lineHeight',
   value: string | number | undefined,
) => {
   const number = Number(value);
   const min = key === 'fontSize' ? 10 : key === 'tabSize' ? 1 : 0;
   const max = key === 'fontSize' ? 32 : key === 'tabSize' ? 8 : 64;
   if (
      value !== '' &&
      Number.isInteger(number) &&
      number >= min &&
      number <= max
   )
      update({ [key]: number });
};

const restoreNumber = (key: 'fontSize' | 'tabSize' | 'lineHeight', event: FocusEvent) => {
   const input = event.target;
   if (input instanceof HTMLInputElement) input.value = String(props.config[key]);
};

const keyboardCapture = useKeyboardCapture((event) => {
   if (event.key === 'Escape') {
      stop();
      return;
   }

   const key = keyFromEvent(event);
   if (key) candidate.value = key;
});

const stop = () => {
   keyboardCapture.stop();
   recording.value = null;
   candidate.value = '';
   shortcutRecording.value = false;
};

const record = (id: string) => {
   resetConflict.value = null;
   recording.value = id;
   candidate.value = '';
   shortcutRecording.value = true;
   keyboardCapture.start();
};

watch(opened, (value) => {
   if (!value) {
      stop();
      resetConflict.value = null;
   }
});
watch(tab, stop);
onUnmounted(stop);

const confirm = () => {
   if (recording.value && !conflict.value) {
      bindings.value = {
         ...bindings.value,
         [recording.value]: candidate.value,
      };
      stop();
   }
};

const toggles = [
   {
      key: 'insertSpaces' as const,
      label: '使用空格缩进',
      description: '按 Tab 时插入空格',
   },
   {
      key: 'wordWrap' as const,
      label: '自动换行',
      description: '长行在编辑器边缘折行',
   },
   {
      key: 'minimap' as const,
      label: '代码缩略图',
      description: '在编辑器右侧显示文件概览',
   },
   {
      key: 'matchBrackets' as const,
      label: '括号匹配',
      description: '高亮光标附近的配对括号',
   },
   {
      key: 'indentGuides' as const,
      label: '缩进参考线',
      description: '显示代码缩进层级',
   },
   {
      key: 'autoCloseBrackets' as const,
      label: '自动闭合括号',
      description: '输入左括号时补全对应括号',
   },
   {
      key: 'autoCloseQuotes' as const,
      label: '自动闭合引号',
      description: '输入引号时补全对应引号',
   },
];

const lineNumberOptions = [
   { label: '普通行号', value: 'on' },
   { label: '相对行号', value: 'relative' },
   { label: '关闭', value: 'off' },
];

const whitespaceOptions = [
   { label: '不显示', value: 'none' },
   { label: '仅选中区域', value: 'selection' },
   { label: '边界空白', value: 'boundary' },
   { label: '全部显示', value: 'all' },
];
</script>

<template>
   <StModal v-model:opened="opened">
      <div
         class="w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-accent-500 bg-accent-600 text-accent-100 shadow-xl overflow-hidden"
      >
         <div class="flex items-center justify-between px-6 py-5 border-b border-accent-500">
            <h2 class="text-lg font-semibold">编辑器设置</h2>
            <StButton
               size="sm"
               aria-label="关闭"
               class="!bg-transparent !p-1 !text-accent-300 hover:!text-white"
               @click="opened = false"
            >
               <Close />
            </StButton>
         </div>
         <div class="px-6 pt-4">
            <StTabs
               v-model="tab"
               :options="[ { label: '编辑器设置', value: 'settings' }, { label: '快捷键', value: 'shortcuts' }, ]"
            />
         </div>
         <div class="h-96 p-6 max-h-[65vh] overflow-y-auto">
            <div v-if="tab === 'settings'" class="space-y-5">
               <div class="setting-row">
                  <div>
                     <div>字体大小</div>
                     <p>调整代码文字的显示大小</p>
                  </div>
                  <StInput
                     :value="config.fontSize"
                     type="number"
                     min="10"
                     max="32"
                     step="1"
                     aria-label="字体大小"
                     outer-class="w-32 shrink-0 bg-accent-500 border border-accent-400 !py-2 !px-3 [&amp;_input]:min-w-0 [&amp;_input]:w-full [&amp;_input]:pr-6"
                     @update:value="updateNumber('fontSize', $event)"
                     @blur="restoreNumber('fontSize', $event)"
                  />
               </div>
               <div class="setting-row">
                  <div>
                     <div>字体</div>
                     <p>输入浏览器可用的字体名称</p>
                  </div>
                  <StInput
                     :value="config.fontFamily"
                     aria-label="字体"
                     outer-class="w-56 shrink-0 bg-accent-500 border border-accent-400 !py-2 !px-3 [&amp;_input]:min-w-0 [&amp;_input]:w-full"
                     @update:value="update({ fontFamily: String($event ?? '') })"
                  />
               </div>
               <div class="setting-row">
                  <div>
                     <div>行高</div>
                     <p>像素值，0 表示自动</p>
                  </div>
                  <StInput
                     :value="config.lineHeight"
                     type="number"
                     min="0"
                     max="64"
                     step="1"
                     aria-label="行高"
                     outer-class="w-32 shrink-0 bg-accent-500 border border-accent-400 !py-2 !px-3 [&amp;_input]:min-w-0 [&amp;_input]:w-full [&amp;_input]:pr-6"
                     @update:value="updateNumber('lineHeight', $event)"
                     @blur="restoreNumber('lineHeight', $event)"
                  />
               </div>
               <div class="setting-row">
                  <div>
                     <div>缩进宽度</div>
                     <p>每一级缩进占用的字符数</p>
                  </div>
                  <StInput
                     :value="config.tabSize"
                     type="number"
                     min="1"
                     max="8"
                     step="1"
                     aria-label="缩进宽度"
                     outer-class="w-32 shrink-0 bg-accent-500 border border-accent-400 !py-2 !px-3 [&amp;_input]:min-w-0 [&amp;_input]:w-full [&amp;_input]:pr-6"
                     @update:value="updateNumber('tabSize', $event)"
                     @blur="restoreNumber('tabSize', $event)"
                  />
               </div>
               <div class="setting-row">
                  <div>
                     <div>行号</div>
                     <p>选择编辑器行号的显示方式</p>
                  </div>
                  <StSelect
                     :value="config.lineNumbers"
                     :options="lineNumberOptions"
                     attach-to-body
                     outer-class="w-40 bg-accent-500 border border-accent-400 !py-2 !px-3"
                     @update:value="$event && update({ lineNumbers: $event })"
                  >
                     <template #selected-preview>
                        {{ lineNumberOptions.find((item) => item.value === config.lineNumbers)?.label }}
                     </template>
                  </StSelect>
               </div>
               <div class="setting-row">
                  <div>
                     <div>空白字符</div>
                     <p>显示空格与制表符标记</p>
                  </div>
                  <StSelect
                     :value="config.renderWhitespace"
                     :options="whitespaceOptions"
                     attach-to-body
                     outer-class="w-40 bg-accent-500 border border-accent-400 !py-2 !px-3"
                     @update:value="$event && update({ renderWhitespace: $event })"
                  >
                     <template #selected-preview>
                        {{ whitespaceOptions.find((item) => item.value === config.renderWhitespace)?.label }}
                     </template>
                  </StSelect>
               </div>
               <div v-for="item in toggles" :key="item.key" class="setting-row">
                  <div>
                     <div>{{ item.label }}</div>
                     <p>{{ item.description }}</p>
                  </div>
                  <StSwitch
                     :aria-label="item.label"
                     :model-value="config[item.key]"
                     @update:model-value="update({ [item.key]: $event })"
                  />
               </div>
            </div>
            <div v-else>
               <div
                  v-for="action in shortcutActions"
                  :key="action.id"
                  class="py-4 first:pt-0 border-b border-accent-500 last:border-b-0"
               >
                  <div class="setting-row flex-wrap !items-start">
                     <div>
                        <div>{{ action.label }}</div>
                        <p>{{ action.description }}</p>
                     </div>
                     <div class="flex items-center gap-3 ml-auto">
                        <div class="flex items-center">
                           <StButton
                              size="sm"
                              type="button"
                              class="shortcut-icon"
                              :aria-label="`重置${action.label}快捷键`"
                              title="重置"
                              @click="reset(action.id)"
                           >
                              <RotateCcw :size="16" />
                           </StButton>
                           <StButton
                              size="sm"
                              type="button"
                              class="shortcut-icon"
                              :class="{ '!text-primary': recording === action.id }"
                              :aria-label="recording === action.id ? (candidate ? '停止录制并保存' : '停止录制并清空快捷键') : `录制${action.label}快捷键`"
                              :title="recording === action.id ? (candidate ? '停止并保存' : '停止并清空') : '录制'"
                              :aria-pressed="recording === action.id"
                              @click="recording === action.id ? confirm() : record(action.id)"
                           >
                              <CircleCheck v-if="recording === action.id" :size="16" />
                              <Mic v-else :size="16" />
                           </StButton>
                        </div>
                        <div
                           class="min-w-[10rem] rounded-md border bg-accent-500 px-3 py-2 text-sm text-center"
                           :class="recording === action.id ? 'border-primary' : 'border-accent-400'"
                           aria-live="polite"
                        >
                           {{ recording === action.id ? candidate ? displayKey(candidate) : '输入新的快捷键' : displayKey(bindings[action.id]) || '未设置' }}
                        </div>
                     </div>
                  </div>
                  <p v-if="recording === action.id && conflict" class="text-error text-sm mt-2" role="alert">
                     已用于“{{ conflict.label }}”，请选择其他组合。
                  </p>
                  <p v-if="resetConflict?.id === action.id" class="text-error text-sm mt-2" role="alert">
                     默认快捷键已用于“{{ resetConflict.label }}”，请先修改该绑定。
                  </p>
               </div>
            </div>
         </div>
      </div>
   </StModal>
</template>
<style scoped>
.shortcut-icon {
   width: 1.75rem;
   height: 2rem;
   flex-shrink: 0;
   padding: 0 !important;
   border-radius: 0.375rem !important;
   background: transparent !important;
   color: var(--color-accent-200);
   transition: transform 150ms ease, color 150ms ease;
}
.shortcut-icon:hover {
   color: var(--color-secondary) !important;
   opacity: 1;
}
.shortcut-icon:active:not(:disabled) {
   transform: scale(0.9);
}
.shortcut-icon:disabled {
   cursor: default;
}
.setting-row {
   display: flex;
   align-items: center;
   justify-content: space-between;
   gap: 1.5rem;
}
.setting-row p {
   margin-top: 0.25rem;
   font-size: 0.75rem;
   color: var(--color-accent-300);
}
</style>
