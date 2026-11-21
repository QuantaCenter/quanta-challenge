<script setup lang="ts">
import { Close, FolderOpen } from '@icon-park/vue-next';
import { FocusScope } from 'reka-ui';
import type { StepsStep } from '~/components/st/Steps/type';
import {
   isIgnoredWorkshopPath,
   isLocalImportPath,
   WORKSHOP_LOCAL_IMPORT_MAX_FILES,
} from '~~/shared/workshop-local-import';
import { useMessage } from '~/components/st/Message/use-message';
import { formatFileSize } from '~/utils/format-file-size';
import WorkshopImportPreview from './WorkshopImportPreview.vue';

const props = defineProps<{ projectCount: number }>();
const opened = defineModel<boolean>('opened', { default: false });
const emit = defineEmits<{ created: [] }>();
const { $authFetch } = useNuxtApp();
const message = useMessage();
const limits = useRuntimeConfig().public.workshop;

const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const content = useTemplateRef<HTMLDivElement>('content');
const selection = shallowRef<{
   folder: string;
   files: { path: string; file: File }[];
   sizeBytes: number;
   ignoredCount: number;
   importId: string;
} | null>(null);
const name = ref('');
const failure = ref('');
const importing = ref(false);
const stage = ref(0);
const stageTitles = ['选择文件夹', '检查文件', '确认导入'];
const steps = computed<StepsStep[]>(() => stageTitles.map((title, index) => ({
   title,
   status: index < stage.value ? 'completed'
      : index > stage.value ? 'waiting'
      : failure.value ? 'error' : 'inProgress',
})));
const stageDescription = computed(() => importing.value
   ? '正在上传并保存项目，请稍候…'
   : [
        '选择本地项目文件夹。',
        '展开目录，核对要导入的文件和大小。',
        '设置项目名称，将文件保存到工坊。',
     ][stage.value]);
const preview = computed(() => {
   const selected = selection.value;
   if (!selected) return null;
   return {
      entries: selected.files.map(({ path, file }) => ({ path, kind: 'file' as const, sizeBytes: file.size })),
      sizeBytes: selected.sizeBytes,
      fileCount: selected.files.length,
      maxProjectBytes: limits.maxProjectBytes,
      canImport: true,
   };
});
const quotaReached = computed(() => props.projectCount >= limits.maxProjectsPerUser);
const canImport = computed(() => !!selection.value && !!name.value.trim() && !quotaReached.value);
const drawerOpened = computed({
   get: () => opened.value,
   set: (value: boolean) => {
      if (!importing.value) opened.value = value;
   },
});

const changeStage = (value: number) => {
   stage.value = value;
   failure.value = '';
   if (content.value) content.value.scrollTop = 0;
};

watch(opened, (value) => {
   if (!value) return;
   selection.value = null;
   name.value = '';
   changeStage(0);
});

useEventListener('keydown', (event) => {
   if (opened.value && event.key === 'Escape') drawerOpened.value = false;
});

const chooseFolder = () => {
   const input = fileInput.value;
   if (!input || importing.value) return;
   if (!('webkitdirectory' in input)) {
      failure.value = '当前浏览器不支持选择文件夹，请换用支持文件夹选择的浏览器。';
      return;
   }
   input.click();
};

const selectFolder = (event: Event) => {
   const input = event.target as HTMLInputElement;
   const selected = Array.from(input.files ?? []);
   input.value = '';
   selection.value = null;
   failure.value = '';
   name.value = '';

   const folder = selected[0]?.webkitRelativePath.split('/')[0];
   if (!folder) {
      failure.value = '请选择包含文件的文件夹。';
      return;
   }

   const files: { path: string; file: File }[] = [];
   let sizeBytes = 0;
   const prefix = `${folder}/`;
   for (const file of selected) {
      const fromFolder = file.webkitRelativePath.startsWith(prefix);
      const path = file.webkitRelativePath.slice(prefix.length);
      if (fromFolder && isIgnoredWorkshopPath(path)) continue;
      if (!fromFolder || !isLocalImportPath(path)) {
         failure.value = `文件「${file.name}」的路径无法导入。`;
         return;
      }
      if (file.size > limits.maxFileBytes) {
         failure.value = `文件「${path}」超过单文件上限 ${formatFileSize(limits.maxFileBytes)}。`;
         return;
      }
      sizeBytes += file.size;
      if (sizeBytes > limits.maxProjectBytes) {
         failure.value = `项目文件总大小不能超过 ${formatFileSize(limits.maxProjectBytes)}。`;
         return;
      }
      if (files.length === WORKSHOP_LOCAL_IMPORT_MAX_FILES) {
         failure.value = `一次最多导入 ${WORKSHOP_LOCAL_IMPORT_MAX_FILES} 个文件。`;
         return;
      }
      files.push({ path, file });
   }
   if (!files.length) {
      failure.value = '这个文件夹没有可导入的文件，请重新选择。';
      return;
   }

   const idBytes = crypto.getRandomValues(new Uint8Array(16));
   selection.value = {
      folder,
      files,
      sizeBytes,
      ignoredCount: selected.length - files.length,
      importId: Array.from(idBytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
   };
   name.value = folder.trim().slice(0, 40).replace(/[\uD800-\uDBFF]$/, '').trimEnd() || '本地项目';
};

const submit = async () => {
   const folder = selection.value;
   if (!folder || !canImport.value || importing.value) return;
   importing.value = true;
   failure.value = '';

   try {
      const form = new FormData();
      form.append('manifest', JSON.stringify({
         importId: folder.importId,
         name: name.value.trim(),
         paths: folder.files.map(({ path }) => path),
      }));
      for (const { file } of folder.files) form.append('file', file, 'file');

      const response = await $authFetch('/api/workshop/import/local', {
         method: 'POST',
         body: form,
      });
      const payload = await response.json().catch(() => null) as { id?: string; data?: { message?: string } } | null;
      if (!response.ok || !payload?.id) {
         failure.value = payload?.data?.message ?? '导入失败，请稍后重试。';
         return;
      }
      message.success('本地项目已导入');
      emit('created');
      opened.value = false;
   } catch {
      failure.value = '上传未完成，请重试。若本地文件已变更，请重新选择文件夹。';
   } finally {
      importing.value = false;
   }
};
</script>

<template>
   <StDrawer v-slot="{ rendered }" v-model:opened="drawerOpened" global width="42rem">
      <FocusScope
         v-if="rendered"
         as="section"
         :trapped="opened"
         :loop="opened"
         role="dialog"
         aria-modal="true"
         aria-label="从本地文件夹导入"
         :aria-busy="importing"
         class="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-t-[inherit] bg-black text-white">
         <StSpace
            justify="between"
            align="center"
            gap="0.75rem"
            class="shrink-0 px-6 pb-4 pt-6 max-md:pt-8"
            fill-x>
            <h2 class="text-xl font-bold">从本地文件夹导入</h2>
            <StButton
               size="sm"
               aria-label="关闭"
               :disabled="importing"
               class="!size-10 !bg-transparent !p-0 !text-accent-300"
               @click="drawerOpened = false">
               <Close size="1.25rem" />
            </StButton>
         </StSpace>

         <div class="shrink-0 px-6 pb-5" aria-live="polite">
            <StSteps :steps="steps" :status="stageDescription" :tone="importing ? 'active' : 'idle'" />
         </div>

         <div ref="content" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
            <div v-if="stage === 0" class="flex flex-col gap-4">
               <input ref="fileInput" type="file" webkitdirectory class="hidden" @change="selectFolder" />
               <div class="flex flex-wrap items-center gap-3 rounded-xl border border-accent-400 p-4">
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-500 text-accent-200">
                     <FolderOpen size="1.25rem" aria-hidden="true" />
                  </div>
                  <div class="min-w-0 flex-1" aria-live="polite">
                     <p class="truncate font-bold" :title="selection?.folder">{{ selection?.folder ?? '项目文件夹' }}</p>
                     <p v-if="selection" class="text-sm text-accent-300">
                        {{ selection.files.length }} 个文件 · {{ formatFileSize(selection.sizeBytes) }}
                     </p>
                  </div>
                  <StButton size="sm" bordered class="shrink-0 whitespace-nowrap !px-3 text-sm" @click="chooseFolder">
                     {{ selection ? '更换文件夹' : '选择文件夹' }}
                  </StButton>
               </div>
               <p class="text-sm text-accent-300">
                  自动跳过 <code>.git</code> 和 <code>node_modules</code> 中的文件。
                  最多导入 {{ WORKSHOP_LOCAL_IMPORT_MAX_FILES }} 个文件，单个文件限 {{ formatFileSize(limits.maxFileBytes) }}，总大小限 {{ formatFileSize(limits.maxProjectBytes) }}。
               </p>
            </div>

            <div v-else-if="stage === 1 && selection" class="flex flex-col gap-4">
               <p class="flex min-w-0 items-center gap-2 text-sm text-accent-300">
                  <FolderOpen size="1rem" class="shrink-0" aria-hidden="true" />
                  <span class="truncate" :title="selection.folder">{{ selection.folder }}</span>
               </p>
               <WorkshopImportPreview label="文件夹目录预览" :preview="preview" :tree-key="selection.importId">
                  <template #note>
                     目录大小包含全部待导入的子文件。
                     <span v-if="selection.ignoredCount">已跳过 {{ selection.ignoredCount }} 个文件（.git 和 node_modules）。</span>
                  </template>
               </WorkshopImportPreview>
            </div>

            <div v-else-if="selection" class="flex flex-col gap-5">
               <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-xl border border-accent-400 p-4 text-sm">
                  <dt class="text-accent-300">文件夹</dt>
                  <dd class="break-all">{{ selection.folder }}</dd>
                  <dt class="text-accent-300">导入内容</dt>
                  <dd>{{ selection.files.length }} 个文件 · {{ formatFileSize(selection.sizeBytes) }}</dd>
               </dl>
               <StFormItem name="local-project-name" label="项目名称" required>
                  <StInput
                     v-model:value="name"
                     aria-label="项目名称"
                     :disabled="importing"
                     maxlength="40"
                     outer-class="w-full min-w-0 bg-accent-500 border border-accent-400 !rounded-lg !py-3 !px-3 focus-within:!border-primary [&_input]:min-w-0 [&_input]:w-full"
                     @keydown.enter="!$event.isComposing && submit()" />
               </StFormItem>
            </div>
         </div>

         <footer class="shrink-0 border-t border-accent-500 bg-black px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <p v-if="failure" role="alert" class="mb-3 break-all text-sm text-error">{{ failure }}</p>
            <p v-else-if="quotaReached" role="status" class="mb-3 text-sm text-accent-300">
               已达到 {{ limits.maxProjectsPerUser }} 个项目的上限，请先删除不再需要的项目。
            </p>
            <div class="flex items-center justify-between gap-3">
               <StButton v-if="stage > 0" bordered :disabled="importing" @click="changeStage(stage - 1)">上一步</StButton>
               <span v-else />
               <StButton v-if="stage < 2" :disabled="!selection" @click="changeStage(stage + 1)">下一步</StButton>
               <StButton v-else :disabled="!canImport" :loading="importing" @click="submit">
                  {{ importing ? '正在导入…' : '确认导入' }}
               </StButton>
            </div>
         </footer>
      </FocusScope>
   </StDrawer>
</template>
