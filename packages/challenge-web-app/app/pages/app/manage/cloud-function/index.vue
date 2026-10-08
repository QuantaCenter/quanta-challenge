<script setup lang="ts">
import CloudFunctionStatsGrid from '~/components/cloud-function/StatsGrid.vue';
import CloudFunctionTable from './_components/CloudFunctionTable.vue';
import ApiKeyTable from './_components/ApiKeyTable.vue';
import ApiKeyCreateDrawer from './_drawers/ApiKeyCreateDrawer.vue';
import ApiKeySecretDrawer from './_drawers/ApiKeySecretDrawer.vue';
import { useCloudFunctionAdmin } from './_composables/use-cloud-function-admin';

useSeoMeta({ title: '云函数管理 - Quanta Challenge' });

const {
   functions,
   functionsInitialLoading,
   keys,
   keysInitialLoading,
   refreshKeys,
   togglingName,
   toggleEnabled,
   removeFunction,
   revokeKey,
} = useCloudFunctionAdmin();

const stats = computed(() => {
   const list = functions.value ?? [];
   return [
      { label: '云函数总数', value: list.length, color: 'text-white' },
      {
         label: '已启用',
         value: list.filter((item) => item.enabled).length,
         color: 'text-success',
      },
      {
         label: '已停用',
         value: list.filter((item) => !item.enabled).length,
         color: 'text-accent-300',
      },
      {
         label: 'API Key',
         value: keys.value?.length ?? 0,
         color: 'text-primary',
      },
   ];
});

const keyFormOpened = ref(false);
const secretDrawerOpened = ref(false);
const createdSecret = ref<{ keyId: string; secret: string } | null>(null);

const handleKeyCreated = async (secret: { keyId: string; secret: string }) => {
   createdSecret.value = secret;
   secretDrawerOpened.value = true;
   await refreshKeys();
};
</script>

<template>
   <StSpace fill justify="center">
      <StSpace
         direction="vertical"
         gap="2.5rem"
         class="w-[64rem] pb-[10rem] my-6">
         <!-- Hero -->
         <h1 class="w-full st-font-hero-bold text-accent-100">云函数管理</h1>

         <CloudFunctionStatsGrid :items="stats" />

         <CloudFunctionTable
            :functions="functions ?? []"
            :loading="functionsInitialLoading"
            :toggling-name="togglingName"
            @toggle="toggleEnabled"
            @remove="removeFunction" />

         <ApiKeyTable
            :keys="keys ?? []"
            :loading="keysInitialLoading"
            @create="keyFormOpened = true"
            @revoke="revokeKey" />
      </StSpace>

      <ApiKeyCreateDrawer
         v-model:opened="keyFormOpened"
         @created="handleKeyCreated" />

      <ApiKeySecretDrawer
         v-model:opened="secretDrawerOpened"
         :secret="createdSecret" />
   </StSpace>
</template>
