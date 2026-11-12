<script setup lang="ts">
import { InboxIn, UploadTwo } from '@icon-park/vue-next';
import {
   LAB_CATEGORY_COLOR,
   LAB_CATEGORY_LABEL,
   LAB_CATEGORY_ORDER,
   type LabTemplateCategory,
} from '@challenge/shared/lab-templates';
import { hasBinarySnapshotExtension } from '@challenge/shared/snapshot-content';
import { useMessage } from '~/components/st/Message/use-message';
import { formatFileSize } from '~/utils/format-file-size';
import UploadProject from '../problem/_components/UploadProject.vue';
import TechTagIcon from '../../lab/_components/TechTagIcon.vue';
import SnapshotImageField from '../../manage/lab-template/_components/SnapshotImageField.vue';

/**
 * 发布 / 编辑自定义实验室模板（`?id=` 为编辑）。
 * 模板文件来自上传的文件夹，或从自己的实验室项目导入；只保存文本文件。
 */

const route = useRoute();
const editingId = typeof route.query.id === 'string' ? route.query.id : '';
const pageTitle = editingId ? '编辑实验室模板' : '发布实验室模板';
useSeoMeta({ title: `${pageTitle} - Quanta Challenge` });

const { $trpc } = useNuxtApp();
const message = useMessage();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const ICON_PRESETS = [
   { label: 'Vue', value: '/icons/vue.png' },
   { label: 'React', value: '/icons/react.png' },
   { label: 'Nuxt', value: '/icons/nuxt.png' },
   { label: 'Svelte', value: '/icons/svelte.png' },
   { label: 'Vite', value: '/icons/vite.png' },
   { label: 'TypeScript', value: '/icons/typescript.png' },
   { label: 'JavaScript', value: '/icons/javascript.png' },
   { label: 'HTML', value: '/icons/html.png' },
   { label: 'CSS', value: '/icons/css.png' },
   { label: 'Tailwind CSS', value: '/icons/tailwindcss.png' },
   { label: 'Sass', value: '/icons/sass.png' },
   { label: 'Node.js', value: '/icons/nodejs.png' },
   { label: 'Express', value: '/icons/express.svg' },
   { label: 'ECharts', value: '/icons/echarts.svg' },
   { label: 'Chart.js', value: '/icons/chartjs.svg' },
   { label: 'D3', value: '/icons/d3.svg' },
   { label: 'WebAssembly', value: '/icons/webassembly.png' },
   { label: 'Markdown', value: '/icons/markdown.png' },
   { label: '终端', value: '/icons/console.png' },
   { label: '文档', value: '/icons/document.png' },
];
const iconOptions = ICON_PRESETS.map((item) => ({ ...item, imageUrl: item.value }));
const selectedIconLabel = computed(
   () => ICON_PRESETS.find((item) => item.value === form.icon)?.label ?? form.icon,
);

const categoryOptions = LAB_CATEGORY_ORDER.map((category) => ({
   label: LAB_CATEGORY_LABEL[category],
   value: category,
   color: LAB_CATEGORY_COLOR[category],
}));

const form = reactive({
   name: '',
   description: '',
   category: 'framework' as LabTemplateCategory,
   tagsText: '',
   icon: '/icons/document.png',
   entry: '',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: '',
   snapshotImageId: '',
   enabled: true,
});

const tags = computed(() => [
   ...new Set(
      form.tagsText
         .split(/[,，]/)
         .map((tag) => tag.trim())
         .filter(Boolean),
   ),
]);

// ————————————————— 模板文件 —————————————————

/** 上传组件的数据：键为 `/<根目录>/<相对路径>`，根目录是上传的文件夹名（或导入时的合成根） */
const projectFs = ref<Record<string, string>>();

const IGNORED_PATH = /(^|\/)(node_modules|\.git)(\/|$)/;
const stripRoot = (key: string) => key.split('/').slice(2).join('/');
const isBinary = (path: string, content: string) =>
   content.startsWith('data:') || hasBinarySnapshotExtension(path);

const fileEntries = computed(() =>
   Object.entries(projectFs.value ?? {})
      .map(([key, content]) => ({ path: stripRoot(key), content }))
      .filter((file) => file.path && !IGNORED_PATH.test(file.path)),
);
const textFiles = computed(() =>
   fileEntries.value
      .filter((file) => !isBinary(file.path, file.content))
      .sort((a, b) => a.path.localeCompare(b.path)),
);
const binaryFiles = computed(() =>
   fileEntries.value
      .filter((file) => isBinary(file.path, file.content))
      .map((file) => file.path),
);
const totalBytes = computed(() =>
   textFiles.value.reduce(
      (sum, file) => sum + new TextEncoder().encode(file.content).length,
      0,
   ),
);

const ENTRY_CANDIDATES = [
   'src/App.vue',
   'src/App.tsx',
   'src/App.jsx',
   'src/main.ts',
   'src/main.js',
   'index.html',
   'index.js',
   'server.js',
   'README.md',
];
const entryOptions = computed(() => [
   { label: '不指定', value: '' },
   ...textFiles.value.map((file) => ({ label: file.path, value: file.path })),
]);
// 文件变化后入口文件不存在时，按常见入口自动选择
watch(textFiles, (files) => {
   const paths = new Set(files.map((file) => file.path));
   if (form.entry && paths.has(form.entry)) return;
   form.entry = ENTRY_CANDIDATES.find((path) => paths.has(path)) ?? '';
});

// 从实验室项目导入
const myProjects = ref<Awaited<ReturnType<typeof $trpc.protected.lab.list.query>>>([]);
const projectsLoading = ref(false);
const selectedProjectId = ref('');
const importing = ref(false);
const projectOptions = computed(() =>
   myProjects.value.map((project) => ({
      label: project.name,
      value: project.id,
      imageUrl: project.template?.icon ?? '/icons/document.png',
      description: `${project.fileCount} 个文件 · ${formatFileSize(project.sizeBytes)}`,
   })),
);
const selectedProjectName = computed(
   () => myProjects.value.find((project) => project.id === selectedProjectId.value)?.name ?? '',
);
const loadProjects = async () => {
   projectsLoading.value = true;
   try {
      myProjects.value = await $trpc.protected.lab.list.query();
   } catch (error) {
      console.error('[lab-template] 获取实验室项目失败:', error);
   } finally {
      projectsLoading.value = false;
   }
};
onMounted(loadProjects);

const importProject = async () => {
   if (!selectedProjectId.value || importing.value) return;
   importing.value = true;
   try {
      const { files } = await $trpc.protected.lab.get.query({ id: selectedProjectId.value });
      const next: Record<string, string> = {};
      let skipped = 0;
      for (const file of files) {
         // 二进制文件只有资产 id、没有文本内容
         if (file.content === null) {
            skipped += 1;
            continue;
         }
         next[file.path] = file.content;
      }
      projectFs.value = next;
      message.success(
         `已导入「${selectedProjectName.value}」`,
         skipped
            ? `${Object.keys(next).length} 个文本文件，跳过 ${skipped} 个二进制文件`
            : `${Object.keys(next).length} 个文件`,
      );
   } catch (error) {
      message.error('导入失败', (error as Error)?.message ?? '请稍后重试');
   } finally {
      importing.value = false;
   }
};

// ————————————————— 编辑：加载已有模板 —————————————————

const detailLoading = ref(!!editingId);
const loadDetail = async () => {
   if (!editingId) return;
   try {
      const detail = await $trpc.admin.labTemplate.detail.query({ id: editingId });
      if (detail.builtin) {
         message.warning('内置模板请在管理页修改', '内置模板的文件由系统维护');
         await navigateTo('/app/manage/lab-template', { replace: true });
         return;
      }
      projectFs.value = Object.fromEntries(
         Object.entries(detail.files).map(([path, content]) => [`/template/${path}`, content]),
      );
      Object.assign(form, {
         name: detail.name,
         description: detail.description,
         category: detail.category,
         tagsText: detail.tags.join(', '),
         icon: detail.icon,
         entry: detail.entry,
         installCommand: detail.installCommand,
         startCommand: detail.startCommand,
         readme: detail.readme,
         snapshotImageId: detail.snapshotImageId ?? '',
         enabled: detail.enabled,
      });
   } catch (error) {
      message.error('加载模板失败', (error as Error)?.message ?? '请稍后重试');
      await navigateTo('/app/manage/lab-template', { replace: true });
   } finally {
      detailLoading.value = false;
   }
};
onMounted(loadDetail);

// ————————————————— 提交 —————————————————

const markdownEditing = ref(false);
const submitting = ref(false);

const validate = () => {
   const name = form.name.trim();
   if (!name || name.length > 40) return '模板名称需为 1～40 个字符';
   if (form.description.trim().length > 200) return '模板简介最多 200 个字符';
   if (tags.value.length > 8) return '技术栈标签最多 8 个';
   if (tags.value.some((tag) => tag.length > 20)) return '单个标签最多 20 个字符';
   if (form.readme.length > 50_000) return '说明文档最多 50000 个字符';
   return '';
};

const submit = async () => {
   if (submitting.value || detailLoading.value) return;
   const error = validate();
   if (error) {
      message.error('表单填写有误', error);
      return;
   }
   const name = form.name.trim();
   const description = form.description.trim();
   const payload = {
      name,
      description,
      category: form.category,
      tags: tags.value,
      icon: form.icon,
      entry: form.entry,
      installCommand: form.installCommand.trim(),
      startCommand: form.startCommand.trim(),
      readme: form.readme.trim() || `# ${name}\n\n${description}`,
      files: Object.fromEntries(textFiles.value.map((file) => [file.path, file.content])),
      snapshotImageId: form.snapshotImageId || null,
      enabled: form.enabled,
   };
   submitting.value = true;
   try {
      if (editingId) {
         await $trpc.admin.labTemplate.update.mutate({ id: editingId, ...payload });
         message.success('模板已更新', '新文件只影响之后创建或重置的项目');
      } else {
         await $trpc.admin.labTemplate.create.mutate(payload);
         message.success('模板已发布', form.enabled ? '成员现在可以在实验室中使用该模板' : '模板当前为停用状态');
      }
      await navigateTo('/app/manage/lab-template');
   } catch (err) {
      message.error(editingId ? '保存失败' : '发布失败', (err as Error)?.message ?? '请稍后重试');
   } finally {
      submitting.value = false;
   }
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[44rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <StSpace direction="vertical" gap="0.5rem">
            <h1 class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">
               {{ pageTitle }}
            </h1>
            <p class="st-font-body-normal text-accent-300 max-md:text-sm">
               成员在实验室中选择模板后，会以模板文件创建自己的项目；修改模板不影响已创建项目的文件。
            </p>
         </StSpace>

         <div v-if="detailLoading" class="w-full space-y-4 px-[0.625rem]">
            <StSkeletonItem class="h-14 w-full rounded-lg" />
            <StSkeletonItem class="h-14 w-full rounded-lg" />
            <StSkeletonItem class="h-40 w-full rounded-lg" />
         </div>

         <StSpace
            v-else
            direction="vertical"
            gap="1.75rem"
            class="w-full px-[0.625rem] max-md:gap-4!">
            <StFormItem name="name" label="模板名称" required>
               <StInput
                  v-model:value="form.name"
                  maxlength="40"
                  placeholder="例如：Vue 3 + Pinia"
                  :outer-class />
            </StFormItem>
            <StFormItem name="description" label="模板简介">
               <StTextarea
                  v-model:value="form.description"
                  rows="2"
                  maxlength="200"
                  placeholder="一两句话介绍模板的用途与技术栈（最多 200 字）"
                  :outer-class />
            </StFormItem>
            <StFormItem name="category" label="分类" required>
               <StSlideRadioGroup v-model:value="form.category" :options="categoryOptions" />
            </StFormItem>
            <StFormItem name="tags" label="技术栈标签">
               <StInput
                  v-model:value="form.tagsText"
                  placeholder="用逗号分隔，例如：Vue, TypeScript, Vite"
                  :outer-class />
               <StSpace v-if="tags.length" align="center" gap="0.5rem" wrap>
                  <span
                     v-for="tag in tags"
                     :key="tag"
                     class="inline-flex h-6 items-center gap-1.5 rounded-md bg-accent-500/60 px-2 text-xs font-medium text-accent-200">
                     <TechTagIcon :name="tag" />
                     <span class="whitespace-nowrap">{{ tag }}</span>
                  </span>
               </StSpace>
            </StFormItem>
            <StFormItem name="icon" label="图标" required>
               <StSelect
                  v-model:value="form.icon"
                  placeholder="选择模板图标"
                  attach-to-body
                  hide-description
                  :max-container-height="320"
                  options-container-class="overflow-y-auto!"
                  :outer-class
                  :options="iconOptions">
                  <template #selected-preview>
                     <StSpace align="center" gap="0.5rem">
                        <img :src="form.icon" alt="" class="size-5 object-contain" />
                        <span class="text-white">{{ selectedIconLabel }}</span>
                     </StSpace>
                  </template>
               </StSelect>
            </StFormItem>

            <StFormItem name="files" label="模板文件">
               <template #header-right>
                  <span class="st-font-caption text-accent-400">
                     {{ textFiles.length }} 个文件 · {{ formatFileSize(totalBytes) }} / 2 MB
                  </span>
               </template>
               <StSpace fill-x gap="0.75rem" align="center" class="max-md:flex-col max-md:items-stretch">
                  <StSelect
                     v-model:value="selectedProjectId"
                     placeholder="从我的实验室项目导入"
                     attach-to-body
                     :loading="projectsLoading"
                     option-empty-text="还没有实验室项目"
                     :max-container-height="320"
                     options-container-class="overflow-y-auto!"
                     :outer-class="`${outerClass} flex-1 min-w-0`"
                     :options="projectOptions">
                     <template #selected-preview>
                        <span class="text-white truncate">{{ selectedProjectName }}</span>
                     </template>
                  </StSelect>
                  <StButton
                     bordered
                     class="shrink-0 h-[3.5rem] px-[1.25rem] !rounded-[0.5rem]"
                     :loading="importing"
                     :disabled="!selectedProjectId"
                     @click="importProject">
                     <div class="flex gap-2 items-center">
                        <InboxIn class="text-[1.125rem]" />
                        <span>导入</span>
                     </div>
                  </StButton>
               </StSpace>
               <UploadProject
                  v-model:project-fs="projectFs"
                  placeholder="或上传模板文件夹（node_modules、.git、dist 会被忽略）"
                  :ignore-directories="['node_modules', '.git', 'dist']" />
               <p class="st-font-caption text-accent-400">
                  可以先在实验室中从任意模板创建项目、调试好后再导入；留空则为空白模板。只保存文本文件。
               </p>
               <p v-if="binaryFiles.length" class="st-font-caption text-warning">
                  以下 {{ binaryFiles.length }} 个二进制文件不会包含在模板中（可放进快照镜像）：
                  {{ binaryFiles.slice(0, 5).join('、') }}{{ binaryFiles.length > 5 ? ' 等' : '' }}
               </p>
            </StFormItem>
            <StFormItem name="entry" label="入口文件">
               <StSelect
                  v-model:value="form.entry"
                  placeholder="不指定（打开项目时自动选择第一个文件）"
                  attach-to-body
                  :max-container-height="320"
                  options-container-class="overflow-y-auto!"
                  :outer-class
                  :options="entryOptions">
                  <template #selected-preview>
                     <span class="text-white font-mono">{{ form.entry }}</span>
                  </template>
               </StSelect>
            </StFormItem>
            <StFormItem name="installCommand" label="安装命令">
               <StInput
                  v-model:value="form.installCommand"
                  placeholder="留空则跳过依赖安装"
                  :outer-class="`${outerClass} font-mono`" />
               <p class="st-font-caption text-accent-400">在项目目录内执行，执行完毕后才会启动。</p>
            </StFormItem>
            <StFormItem name="startCommand" label="启动命令">
               <StInput
                  v-model:value="form.startCommand"
                  placeholder="留空则只进入项目目录，不启动服务"
                  :outer-class="`${outerClass} font-mono`" />
               <p class="st-font-caption text-accent-400">
                  写入交互式终端执行，用户可以 Ctrl+C 停止后继续在终端里操作。
               </p>
            </StFormItem>
            <SnapshotImageField v-model:value="form.snapshotImageId" :outer-class />
            <StFormItem name="readme" label="说明文档（Markdown）">
               <template #header-right>
                  <LazyMarkdownEditingDrawer
                     hydrate-on-visible
                     v-model:opened="markdownEditing"
                     v-model:markdown="form.readme" />
                  <StTextButton
                     text="使用 md 编辑器"
                     @click="markdownEditing = !markdownEditing" />
               </template>
               <StTextarea
                  v-model:value="form.readme"
                  rows="6"
                  placeholder="在模板详情的「介绍」与 IDE 的「说明」中展示；留空则使用模板名称与简介"
                  :outer-class="`${outerClass} font-mono text-sm`" />
            </StFormItem>
            <StFormItem name="enabled" label="立即启用">
               <StSpace align="center" gap="0.75rem">
                  <StSwitch v-model="form.enabled" />
                  <span class="st-font-caption text-accent-300">
                     {{ form.enabled ? '保存后在实验室中展示' : '保存后暂不展示，可稍后在管理页启用' }}
                  </span>
               </StSpace>
            </StFormItem>
         </StSpace>

         <StSpace justify="between" align="center" class="w-full px-2 mt-4">
            <NuxtLink to="/app/manage/lab-template" class="st-font-body-normal text-accent-300 hover:text-white">
               返回模板管理
            </NuxtLink>
            <StButton
               :loading="submitting"
               :disabled="detailLoading"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]"
               @click="submit">
               <div class="flex gap-2 items-center">
                  <UploadTwo class="text-[1.5rem]" />
                  <span>{{ editingId ? '保存修改' : '发布模板' }}</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
