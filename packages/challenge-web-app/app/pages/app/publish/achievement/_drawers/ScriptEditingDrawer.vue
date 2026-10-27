<script setup lang="ts">
import { BookOne, SaveOne } from '@icon-park/vue-next';
import { useSimpleEditor } from '~/composables/use-simple-editor';
import { convertToDts, type IDataLoader } from '../_utils/dts-file-parser';

const script = defineModel<string>('script');
const opened = defineModel<boolean>('opened', { default: false });

const props = defineProps<{
   dataLoaders: IDataLoader[];
}>();

const defaultScript = `/**
 * \`props\`: 选择的成就依赖数据
 * \`achieved\`: 是否达成成就
 * \`progress\`: 进度，范围为 0 ~ 1
 */
export default defineCheckFunc((props) => {
   // 在这里编写成就检测逻辑
   return { achieved: false, progress: 0 };
})`;

const { containerKey, onEditorContentChanged, onEditorReady } = useSimpleEditor(
   {
      script: script.value || defaultScript,
   }
);
onEditorContentChanged((value) => {
   script.value = value;
});

onEditorReady((_, monaco) => {
   let cleanup: Function | null = null;
   watchEffect(() => {
      cleanup && cleanup();
      const dts = convertToDts(props.dataLoaders);
      const dispose =
         monaco.languages.typescript.typescriptDefaults.addExtraLib(dts);
      cleanup = () => dispose.dispose();
   });
});
</script>

<template>
   <StDrawer global v-model:opened="opened" width="45rem">
      <StSpace direction="vertical" gap="1rem" class="text-white h-full">
         <StSpace direction="vertical" gap="1.5rem" class="p-6 w-full h-full">
            <!-- Header -->
            <StSpace justify="between" align="end" class="w-full">
               <h1 class="st-font-secondary-bold max-md:text-[1.25rem]">编辑成就检测脚本</h1>
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
