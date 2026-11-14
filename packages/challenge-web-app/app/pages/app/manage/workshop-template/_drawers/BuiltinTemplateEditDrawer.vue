<script setup lang="ts">
import { useMessage } from '~/components/st/Message/use-message';
import SnapshotImageField from '../_components/SnapshotImageField.vue';

/** 内置模板：修改名称、简介、安装 / 启动命令与快照镜像（文件与说明文档由系统维护） */

const props = defineProps<{ templateId: string | null }>();
const opened = defineModel<boolean>('opened', { default: false });
const emit = defineEmits<{ saved: [] }>();

const { $trpc } = useNuxtApp();
const message = useMessage();

type Detail = Awaited<ReturnType<typeof $trpc.admin.workshopTemplate.detail.query>>;
const detail = ref<Detail | null>(null);
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const form = reactive({
   name: '',
   description: '',
   installCommand: '',
   startCommand: '',
   snapshotImageId: '',
});
const outerClass = 'border !py-3 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';
let requestId = 0;

watch(
   () => [opened.value, props.templateId] as const,
   async ([isOpened, id]) => {
      const request = ++requestId;
      if (!isOpened || !id) return;
      loading.value = true;
      loadError.value = '';
      detail.value = null;
      try {
         const result = await $trpc.admin.workshopTemplate.detail.query({ id });
         if (request !== requestId) return;
         detail.value = result;
         Object.assign(form, {
            name: result.name,
            description: result.description,
            installCommand: result.installCommand,
            startCommand: result.startCommand,
            snapshotImageId: result.snapshotImageId ?? '',
         });
      } catch (error) {
         if (request === requestId) loadError.value = (error as Error)?.message ?? '加载失败';
      } finally {
         if (request === requestId) loading.value = false;
      }
   },
   { immediate: true },
);

const defaults = computed(() => detail.value?.defaults ?? null);

const restoreField = (field: 'name' | 'description' | 'installCommand' | 'startCommand') => {
   if (defaults.value) form[field] = defaults.value[field];
};

const submit = async () => {
   if (!detail.value || saving.value) return;
   const name = form.name.trim();
   if (!name || name.length > 40) {
      message.error('请检查模板名称', '名称需为 1～40 个字符');
      return;
   }
   if (form.description.trim().length > 200) {
      message.error('请检查模板简介', '简介最多 200 个字符');
      return;
   }
   saving.value = true;
   try {
      await $trpc.admin.workshopTemplate.updateBuiltin.mutate({
         id: detail.value.id,
         name,
         description: form.description.trim(),
         installCommand: form.installCommand.trim(),
         startCommand: form.startCommand.trim(),
         snapshotImageId: form.snapshotImageId || null,
      });
      message.success('模板已更新', '新配置对之后打开的项目立即生效');
      opened.value = false;
      emit('saved');
   } catch (error) {
      message.error('保存失败', (error as Error)?.message ?? '请稍后重试');
   } finally {
      saving.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="36rem">
      <StSpace direction="vertical" gap="0" class="h-full text-white pt-4 md:pt-0" fill>
         <div class="w-full flex-1 min-h-0 overflow-auto p-6">
            <h2 class="st-font-secondary-bold max-md:text-[1.25rem]">修改内置模板</h2>
            <p class="st-font-caption text-accent-300 mt-2 mb-6">
               模板文件与说明文档由系统维护；与默认值相同的字段会跟随系统更新。
            </p>
            <div v-if="loading" class="space-y-4">
               <StSkeletonItem class="h-6 w-[10rem] rounded-md" />
               <StSkeletonItem class="h-12 w-full rounded-lg" />
               <StSkeletonItem class="h-12 w-full rounded-lg" />
               <StSkeletonItem class="h-12 w-full rounded-lg" />
            </div>
            <p v-else-if="loadError" class="st-font-body-normal text-error">{{ loadError }}</p>
            <StSpace v-else-if="detail" direction="vertical" gap="1.5rem" class="w-full">
               <StSpace align="center" gap="0.75rem" class="w-full rounded-lg bg-accent-600 px-4 py-3">
                  <img :src="detail.icon" :alt="detail.name" class="size-7 object-contain" draggable="false" />
                  <StSpace direction="vertical" gap="0" class="min-w-0">
                     <span class="st-font-body-bold truncate">{{ defaults?.name }}</span>
                     <span class="font-mono st-font-caption text-accent-400">
                        {{ detail.id }} · {{ Object.keys(detail.files).length }} 个文件
                     </span>
                  </StSpace>
               </StSpace>

               <StFormItem name="name" label="模板名称" required>
                  <template v-if="defaults && form.name !== defaults.name" #header-right>
                     <StTextButton text="恢复默认" @click="restoreField('name')" />
                  </template>
                  <StInput v-model:value="form.name" maxlength="40" placeholder="1～40 个字符" :outer-class />
               </StFormItem>
               <StFormItem name="description" label="模板简介">
                  <template v-if="defaults && form.description !== defaults.description" #header-right>
                     <StTextButton text="恢复默认" @click="restoreField('description')" />
                  </template>
                  <StTextarea
                     v-model:value="form.description"
                     rows="3"
                     maxlength="200"
                     placeholder="最多 200 个字符"
                     :outer-class />
               </StFormItem>
               <StFormItem name="installCommand" label="安装命令">
                  <template v-if="defaults && form.installCommand !== defaults.installCommand" #header-right>
                     <StTextButton text="恢复默认" @click="restoreField('installCommand')" />
                  </template>
                  <StInput
                     v-model:value="form.installCommand"
                     placeholder="留空则跳过依赖安装"
                     :outer-class="`${outerClass} font-mono`" />
                  <p class="st-font-caption text-accent-400">
                     在项目目录内执行，执行完毕后才会启动；默认：<code class="font-mono">{{ defaults?.installCommand || '（不安装）' }}</code>
                  </p>
               </StFormItem>
               <StFormItem name="startCommand" label="启动命令">
                  <template v-if="defaults && form.startCommand !== defaults.startCommand" #header-right>
                     <StTextButton text="恢复默认" @click="restoreField('startCommand')" />
                  </template>
                  <StInput
                     v-model:value="form.startCommand"
                     placeholder="留空则只进入项目目录，不启动服务"
                     :outer-class="`${outerClass} font-mono`" />
                  <p class="st-font-caption text-accent-400">
                     写入交互式终端执行；默认：<code class="font-mono">{{ defaults?.startCommand || '（不启动）' }}</code>
                  </p>
               </StFormItem>
               <SnapshotImageField v-model:value="form.snapshotImageId" :outer-class />
            </StSpace>
         </div>
         <StSpace justify="end" gap="0.75rem" class="w-full border-t border-accent-600 p-4">
            <StButton bordered @click="opened = false">取消</StButton>
            <StButton :loading="saving" :disabled="loading || !detail" @click="submit">保存修改</StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
