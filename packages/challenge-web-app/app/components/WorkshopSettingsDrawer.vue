<script setup lang="ts">
import { Close } from '@icon-park/vue-next';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import { useEventEmitter } from '~/composables/use-event-emitter';

const props = defineProps<{
   projectId: string;
   startCommand: string | null;
   defaultStartCommand: string;
   resettable: boolean;
}>();
const opened = defineModel<boolean>('opened', { default: false });
const emit = defineEmits<{ saved: [command: string | null] }>();
const { $trpc } = useNuxtApp();
const message = useMessage();
const tab = ref('project');
const command = ref('');
const useDefault = ref(true);
const saving = ref(false);
const tabs = computed(() => [
   { label: '项目设置', value: 'project' },
   ...(props.resettable ? [{ label: '重置', value: 'reset' }] : []),
]);
const draft = computed(() => (useDefault.value ? null : command.value.trim()));
const dirty = computed(() => draft.value !== props.startCommand);

watch(opened, (visible) => {
   if (!visible) return;
   tab.value = 'project';
   command.value = props.startCommand ?? props.defaultStartCommand;
   useDefault.value = props.startCommand === null;
});

const restoreDefault = () => {
   command.value = props.defaultStartCommand;
   useDefault.value = true;
};
const save = async () => {
   if (saving.value || !dirty.value) return;
   const value = draft.value;
   saving.value = true;
   try {
      await $trpc.protected.workshop.update.mutate({
         id: props.projectId,
         startCommand: value,
      });
      emit('saved', value);
      message.success('项目设置已保存', '启动命令将在下次打开项目时生效');
   } catch (error) {
      message.error(
         '保存失败',
         error instanceof Error ? error.message : '请稍后重试',
      );
   } finally {
      saving.value = false;
   }
};

const { emit: emitReset } = useEventEmitter<{ at: number }>(
   'workshop',
   'reset',
);
const reset = async () => {
   const confirmed = await dialog.confirm({
      title: '重置项目',
      description:
         '项目中的所有文件（包括上传的文件）都会被替换为模板初始文件，且无法恢复。项目设置会保留。',
      variant: 'danger',
      confirmText: '确认重置',
      cancelText: '取消',
   });
   if (!confirmed) return;
   opened.value = false;
   emitReset({ at: Date.now() });
};
</script>

<template>
   <StDrawer v-model:opened="opened" global fit width="28rem">
      <div role="dialog" aria-modal="true" aria-label="工坊设置" class="flex h-full min-w-0 flex-col gap-5 overflow-y-auto p-6 text-white max-md:pt-10">
         <StSpace justify="between" align="center" fill-x>
            <h2 class="text-xl font-bold">工坊设置</h2>
            <StButton size="sm" aria-label="关闭工坊设置" class="!bg-transparent !p-2" @click="opened = false">
               <Close aria-hidden="true" />
            </StButton>
         </StSpace>
         <StTabs v-model="tab" :options="tabs" />

         <StSpace v-if="tab === 'project'" direction="vertical" gap="1.25rem" fill-x>
            <StFormItem name="start-command" label="启动命令" class="w-full">
               <StInput
                  v-model:value="command"
                  aria-label="启动命令"
                  placeholder="例如 npm run dev"
                  maxlength="2000"
                  :disabled="saving"
                  outer-class="w-full bg-accent-600 border border-accent-500 font-mono"
                  @update:value="useDefault = false" />
            </StFormItem>
            <p class="text-sm leading-6 text-accent-300">
               命令在项目目录中执行，保存后下次打开项目时生效。留空则只打开终端。
            </p>
            <StSpace align="center" gap="0.75rem" fill-x>
               <StButton :loading="saving" :disabled="!dirty" @click="save">保存设置</StButton>
               <StButton bordered :disabled="saving || useDefault" @click="restoreDefault">恢复默认命令</StButton>
            </StSpace>
         </StSpace>

         <StSpace v-else-if="tab === 'reset' && resettable" direction="vertical" gap="1.25rem" fill-x>
            <p class="text-sm leading-6 text-accent-300">
               将项目文件恢复为模板初始内容，包括上传的文件。此操作无法撤销，项目设置会保留。
            </p>
            <StButton theme="danger" @click="reset">重置项目</StButton>
         </StSpace>
      </div>
   </StDrawer>
</template>
