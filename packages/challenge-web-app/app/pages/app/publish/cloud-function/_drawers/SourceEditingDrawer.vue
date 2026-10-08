<script setup lang="ts">
import { PlayOne, SaveOne, UploadOne } from '@icon-park/vue-next';
import { useSimpleEditor } from '~/composables/use-simple-editor';
import { useMessage } from '~/components/st/Message/use-message';

/**
 * 云函数源码编辑抽屉：写代码 → （可选）试运行 → 保存(不发布) / 发布新版本。
 *
 * 编辑器实例常驻（StDrawer 的插槽始终在 DOM 中，只是被平移到屏幕外），
 * 因此每次打开时用 `setEditorContent` 重新灌入源码，避免上一次的残留。
 */
const props = defineProps<{
   /** 函数名（用于试运行） */
   name: string;
   /** 初始源码；打开抽屉时载入 */
   source?: string;
   /** 发布中（保存并生效） */
   submitting?: boolean;
   /** 保存中（仅生成版本，不生效） */
   saving?: boolean;
}>();

const opened = defineModel<boolean>('opened', { default: false });

const emits = defineEmits<{
   /** 点击「发布新版本」（生成版本并设为生效），参数是当前编辑器内容 */
   submit: [source: string];
   /** 点击「保存但不发布」（只生成版本，不设为生效） */
   save: [source: string];
}>();

const { $trpc } = useNuxtApp();
const message = useMessage();

const DEFAULT_SOURCE = `export default async function (ctx: CloudFunctionContext) {
   const { input, user, kv, log } = ctx;

   // 用户隔离开启时，key 会自动带上当前用户前缀，互不可见
   const hits = await kv.incr('hits', 1);
   log.info('invoked', { hits });

   return { ok: true, hits, input };
}
`;

const DEFAULT_INPUT = `{
   "hello": "world"
}`;

// ── 源码编辑器 ──────────────────────────────────────────────────────────────
const content = ref('');
const { containerKey, onEditorReady, onEditorContentChanged, setEditorContent } =
   useSimpleEditor({
      script: props.source || DEFAULT_SOURCE,
      language: 'typescript',
      containerRef: 'source-editor',
      // 注入 ctx 的类型声明，编辑器里才有补全（见 public/cloud-function.dts）
      imports: ['/cloud-function.dts'],
   });

onEditorContentChanged((value) => {
   content.value = value;
});

const applySource = () => {
   const next = props.source || DEFAULT_SOURCE;
   setEditorContent(next);
   content.value = next;
};

watch(opened, (isOpen) => {
   if (isOpen) applySource();
});
onEditorReady(() => {
   if (opened.value) applySource();
});

// ── 试运行输入（JSON 编辑器） ────────────────────────────────────────────────
const testInput = ref(DEFAULT_INPUT);
const {
   containerKey: inputContainerKey,
   onEditorContentChanged: onInputEditorContentChanged,
} = useSimpleEditor({
   script: DEFAULT_INPUT,
   language: 'json',
   containerRef: 'input-editor',
   options: {
      lineNumbers: 'off',
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 0,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      fontSize: 13,
      padding: { top: 10, bottom: 10 },
      wordWrap: 'on',
   },
});

onInputEditorContentChanged((value) => {
   testInput.value = value;
});

const testResult = ref<string | null>(null);
const testing = ref(false);

const handleTest = async () => {
   let input: unknown;
   try {
      input = JSON.parse(testInput.value || 'null');
   } catch {
      message.error('试运行失败', '输入不是合法的 JSON');
      return;
   }

   testing.value = true;
   testResult.value = null;
   try {
      const data = await $trpc.admin.cloudFunction.test.mutate({
         name: props.name,
         source: content.value,
         input,
      });
      testResult.value = JSON.stringify(data ?? null, null, 2);
   } catch (error) {
      testResult.value = `❌ ${(error as Error)?.message ?? '试运行失败'}`;
   } finally {
      testing.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="56rem">
      <StSpace direction="vertical" gap="0" class="h-screen text-white">
         <StSpace
            direction="vertical"
            gap="1rem"
            class="w-full flex-1 min-h-0 p-6">
            <StSpace justify="between" align="end" class="w-full">
               <StSpace direction="vertical" gap="0.25rem">
                  <h2 class="st-font-secondary-bold">编辑并发布云函数</h2>
                  <p class="st-font-caption text-accent-300">
                     {{ name }} · 仅支持单文件、零依赖（不能 import 外部模块）
                  </p>
               </StSpace>
            </StSpace>
            <main
               :ref="containerKey"
               class="w-full flex-1 min-h-0 bg-simple-editor-background"></main>

            <!-- 试运行 -->
            <StSpace direction="vertical" gap="0.5rem" class="w-full">
               <StSpace align="center" justify="between" class="w-full">
                  <span class="st-font-body-bold text-accent-200">试运行</span>
                  <StButton
                     :loading="testing"
                     class="py-[0.25rem] px-[0.75rem] text-accent-100 !bg-accent-600"
                     @click="handleTest">
                     <div class="flex items-center gap-2">
                        <!-- loading 时用 StButton 自带的转圈替换掉「运行」图标，
                             而不是把转圈追加在它左边 -->
                        <PlayOne
                           v-if="!testing"
                           class="text-[1.125rem]" />
                        <span class="text-[0.8125rem]">运行</span>
                     </div>
                  </StButton>
               </StSpace>

               <!-- 输入参数 + 运行结果合并成一块：无边框 / 无圆角，底色与上方编辑器一致 -->
               <div
                  class="grid w-full grid-cols-2 bg-simple-editor-background">
                  <div class="min-w-0 px-3 py-2">
                     <div class="mb-1 st-font-caption text-accent-400">
                        输入参数（JSON）
                     </div>
                     <div :ref="inputContainerKey" class="h-[9rem] w-full"></div>
                  </div>
                  <div class="min-w-0 px-3 py-2">
                     <div class="mb-1 st-font-caption text-accent-400">
                        运行结果
                     </div>
                     <!-- 字号/行高对齐左侧 Monaco 输入框（fontSize: 13 = 0.8125rem），
                          并补上 Monaco 自带的 10px 顶部内边距，让两边文字顶端对齐 -->
                     <div
                        class="h-[9rem] w-full overflow-auto pt-[0.625rem] text-[0.8125rem] leading-[1.5]">
                        <StCodePreview
                           :code="testResult ?? '—'"
                           language="json" />
                     </div>
                  </div>
               </div>
            </StSpace>
         </StSpace>

         <StSpace
            justify="end"
            align="center"
            gap="0.75rem"
            class="w-full border-t border-accent-600 p-4">
            <StButton
               bordered
               theme="primary"
               :loading="saving"
               class="py-[0.375rem] px-[1.25rem]"
               @click="emits('save', content)">
               <div class="flex items-center gap-2">
                  <SaveOne class="text-[1.5rem]" />
                  <span>保存但不发布</span>
               </div>
            </StButton>
            <StButton
               :loading="submitting"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]"
               @click="emits('submit', content)">
               <div class="flex items-center gap-2">
                  <UploadOne class="text-[1.5rem]" />
                  <span>发布新版本</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
