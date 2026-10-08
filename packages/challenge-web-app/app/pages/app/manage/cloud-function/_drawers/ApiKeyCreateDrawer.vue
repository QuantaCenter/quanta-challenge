<script setup lang="ts">
import { Key } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import { API_KEY_SCOPES, SCOPE_META } from '../_utils/scopes';

/** 签发 API Key：名称 + 权限 + 可调用函数白名单。 */
const opened = defineModel<boolean>('opened', { default: false });

const emits = defineEmits<{
   /** 签发成功：把只出现一次的 secret 交给页面弹「立即保存」 */
   created: [payload: { keyId: string; secret: string }];
}>();

const { $trpc } = useNuxtApp();
const message = useMessage();

const form = reactive({
   name: '',
   scopes: ['invoke'] as string[],
   allowedFunctionsText: '',
});
const creating = ref(false);

const toggleScope = (scope: string) => {
   const index = form.scopes.indexOf(scope);
   if (index >= 0) form.scopes.splice(index, 1);
   else form.scopes.push(scope);
};

watch(opened, (isOpen) => {
   if (!isOpen) return;
   form.name = '';
   form.scopes = ['invoke'];
   form.allowedFunctionsText = '';
});

const submit = async () => {
   if (!form.name.trim()) {
      message.error('请填写名称');
      return;
   }
   if (form.scopes.length === 0) {
      message.error('至少选择一个权限');
      return;
   }

   creating.value = true;
   try {
      const allowedFunctions = form.allowedFunctionsText
         .split(/[\s,]+/)
         .map((item) => item.trim())
         .filter(Boolean);

      const result = await $trpc.admin.cloudFunction.createKey.mutate({
         name: form.name.trim(),
         scopes: form.scopes as (typeof API_KEY_SCOPES)[number][],
         allowedFunctions,
      });

      opened.value = false;
      emits('created', { keyId: result.keyId, secret: result.secret });
   } catch (err) {
      message.error('签发失败', (err as Error)?.message ?? '请稍后重试');
   } finally {
      creating.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="30rem">
      <StSpace direction="vertical" gap="0" class="h-screen text-white" fill>
         <StSpace
            direction="vertical"
            gap="1.25rem"
            class="w-full flex-1 min-h-0 overflow-auto p-6">
            <StSpace direction="vertical" gap="0.25rem">
               <h2 class="st-font-secondary-bold">签发 API Key</h2>
               <p class="st-font-caption text-accent-300">
                  secret 仅在创建后显示一次，请立即妥善保存。
               </p>
            </StSpace>

            <StSpace direction="vertical" gap="0.5rem" class="w-full">
               <label class="st-font-caption text-accent-200">名称</label>
               <StInput
                  v-model:value="form.name"
                  placeholder="例如 外部活动系统"
                  outer-class="border !py-3 !px-4 !rounded-[0.5rem] w-full" />
            </StSpace>

            <StSpace direction="vertical" gap="0.5rem" class="w-full">
               <label class="st-font-caption text-accent-200">权限</label>
               <StSpace gap="0.5rem" wrap>
                  <button
                     v-for="(meta, scope) in SCOPE_META"
                     :key="scope"
                     type="button"
                     class="rounded-md border px-3 py-1 st-font-caption transition-colors cursor-pointer"
                     :class="
                        form.scopes.includes(scope)
                           ? 'border-primary bg-primary/15 text-primary'
                           : 'border-accent-500 text-accent-300 hover:border-accent-300'
                     "
                     @click="toggleScope(scope)">
                     {{ meta.label }}
                  </button>
               </StSpace>
            </StSpace>

            <StSpace direction="vertical" gap="0.5rem" class="w-full">
               <label class="st-font-caption text-accent-200">
                  可调用函数白名单（可选）
               </label>
               <StInput
                  v-model:value="form.allowedFunctionsText"
                  placeholder="留空不限制，例如 daily-bonus, another-fn"
                  outer-class="border !py-3 !px-4 !rounded-[0.5rem] w-full" />
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
               :loading="creating"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.5rem]"
               @click="submit">
               <div class="flex gap-2 items-center">
                  <Key class="text-[1.25rem]" />
                  <span>签发</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
