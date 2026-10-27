<script setup lang="ts">
import type monaco from 'monaco-editor';
import { BookOne, SaveOne } from '@icon-park/vue-next';
import { useSimpleEditor } from '~/composables/use-simple-editor';

const props = defineProps<{
   problemType?: 'frontend' | 'backend_service';
}>();

const script = defineModel<string>('script');
const opened = defineModel<boolean>('opened', { default: false });

// 模板由发布页按题型写进 script（见 judge-script-template.ts），这里只负责编辑。
const { containerKey, onEditorContentChanged, onEditorReady } = useSimpleEditor({
   script: script.value ?? '',
});

let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let monacoInstance: typeof import('monaco-editor') | null = null;
let typeLib: { dispose(): void } | null = null;

const loadTypeDeclarations = async (problemType?: string) => {
   if (!monacoInstance) return;
   const file =
      problemType === 'backend_service'
         ? '/system.backend.standalone.dts'
         : '/system.frontend.standalone.dts';
   const content = await fetch(file).then((res) => res.text());
   typeLib?.dispose();
   typeLib =
      monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
         content,
         file
      );
};

onEditorReady((instance, monacoModule) => {
   editor = instance;
   monacoInstance = monacoModule;
   void loadTypeDeclarations(props.problemType);
});

// 切题型：换类型声明，并把草稿里的（新题型）模板同步进已挂载的编辑器
watch(
   () => props.problemType,
   (problemType) => {
      void loadTypeDeclarations(problemType);
   }
);
watch(script, (value) => {
   if (editor && editor.getValue() !== (value ?? '')) {
      editor.setValue(value ?? '');
   }
});

onEditorContentChanged((value) => {
   script.value = value;
});
</script>

<template>
   <StDrawer global v-model:opened="opened" width="45rem">
      <StSpace direction="vertical" gap="1rem" class="text-white h-full">
         <StSpace direction="vertical" gap="1.5rem" class="p-6 w-full h-full">
            <!-- Header -->
            <StSpace justify="between" align="end" class="w-full">
               <h1 class="st-font-secondary-bold max-md:text-[1.25rem]">编辑判题脚本</h1>
               <StButton
                  class="py-[0.375rem] px-[0.75rem] text-accent-100 !bg-accent-600">
                  <div class="flex gap-2 items-center">
                     <BookOne class="text-[1.25rem]" />
                     <span class="font-light">查看文档</span>
                  </div>
               </StButton>
            </StSpace>
            <main
               :ref="containerKey"
               class="flex flex-1 size-full bg-simple-editor-background"></main>
         </StSpace>
         <!-- Bottom -->
         <StSpace justify="end" class="p-4 w-full">
            <StButton
               @click="opened = false"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
               <div class="flex gap-2 items-center">
                  <SaveOne class="text-[1.5rem]" />
                  <span>保存</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
