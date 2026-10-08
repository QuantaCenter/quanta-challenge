<script setup lang="ts">
import { Plus } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

/** 新建云函数表单（名称 + 描述 + KV 隔离 + 超时）。 */
const opened = defineModel<boolean>('opened', { default: false });

const emits = defineEmits<{
   created: [name: string];
}>();

const { $trpc } = useNuxtApp();
const message = useMessage();

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const outerClass = 'border !py-3 !px-4 !rounded-[0.5rem] w-full';

const form = reactive({
   name: '',
   description: '',
   kvUserIsolated: true,
   timeoutMs: 5000,
});

watch(opened, (isOpen) => {
   if (!isOpen) return;
   form.name = '';
   form.description = '';
   form.kvUserIsolated = true;
   form.timeoutMs = 5000;
});

const loading = ref(false);

const submit = async () => {
   if (!NAME_PATTERN.test(form.name)) {
      message.error(
         '函数名不合法',
         '只能是小写字母、数字与连字符，且以字母开头，最长 63 字符',
      );
      return;
   }
   if (
      !Number.isInteger(form.timeoutMs) ||
      form.timeoutMs < 100 ||
      form.timeoutMs > 30_000
   ) {
      message.error('超时不合法', '超时时间需在 100 ~ 30000 毫秒之间');
      return;
   }

   loading.value = true;
   try {
      await $trpc.admin.cloudFunction.create.mutate({
         name: form.name,
         description: form.description,
         kvUserIsolated: form.kvUserIsolated,
         timeoutMs: form.timeoutMs,
      });
      message.success('创建成功', '接下来编写并发布第一个版本');
      emits('created', form.name);
      opened.value = false;
   } catch (error) {
      message.error('创建失败', (error as Error)?.message ?? '请稍后重试');
   } finally {
      loading.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="32rem">
      <StSpace direction="vertical" gap="0" class="h-screen text-white" fill>
         <StSpace
            direction="vertical"
            gap="1.25rem"
            class="w-full flex-1 min-h-0 overflow-auto p-6">
            <StSpace direction="vertical" gap="0.25rem">
               <h2 class="st-font-secondary-bold">新建云函数</h2>
               <p class="st-font-caption text-accent-300">
                  创建后即可编写源码并发布版本，成员与内部服务通过 HTTP 调用。
               </p>
            </StSpace>

            <StSpace direction="vertical" gap="0.5rem" class="w-full">
               <label class="st-font-caption text-accent-200">函数名</label>
               <StInput
                  v-model:value="form.name"
                  placeholder="例如 daily-bonus"
                  :outer-class="outerClass" />
               <span class="st-font-caption text-accent-400">
                  只能小写字母、数字、连字符，创建后不可修改
               </span>
            </StSpace>

            <StSpace direction="vertical" gap="0.5rem" class="w-full">
               <label class="st-font-caption text-accent-200">描述</label>
               <StTextarea
                  v-model:value="form.description"
                  placeholder="这个函数用来做什么"
                  :outer-class="outerClass" />
            </StSpace>

            <StSpace align="center" justify="between" class="w-full">
               <StSpace direction="vertical" gap="0.25rem">
                  <span class="st-font-body-bold text-accent-100">
                     KV 按用户隔离
                  </span>
                  <span class="st-font-caption text-accent-400">
                     开启后每个用户的 KV 互不可见（推荐）
                  </span>
               </StSpace>
               <StSwitch v-model="form.kvUserIsolated" />
            </StSpace>

            <StSpace align="center" justify="between" class="w-full">
               <StSpace direction="vertical" gap="0.25rem">
                  <span class="st-font-body-bold text-accent-100">
                     单次调用超时
                  </span>
                  <span class="st-font-caption text-accent-400">
                     毫秒，100 ~ 30000
                  </span>
               </StSpace>
               <StInput
                  v-model:value="form.timeoutMs"
                  type="number"
                  outer-class="border !py-2 !px-3 !rounded-[0.5rem] w-[8rem]" />
            </StSpace>
         </StSpace>

         <StSpace
            justify="end"
            gap="0.75rem"
            class="w-full border-t border-accent-600 p-4">
            <StButton
               bordered
               theme="primary"
               class="py-[0.375rem] px-[1rem]"
               @click="opened = false">
               取消
            </StButton>
            <StButton
               :loading="loading"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]"
               @click="submit">
               <div class="flex gap-2 items-center">
                  <Plus class="text-[1.5rem]" />
                  <span>创建</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
