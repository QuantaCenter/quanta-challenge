<script setup lang="ts">
import { useSnapshotImageOptions } from '../_composables/use-snapshot-image-options';

/** 快照镜像选择：空字符串表示不使用快照镜像 */

defineProps<{ outerClass?: string }>();

const value = defineModel<string>('value', { default: '' });

const { options, loading, refresh, selectedName, selectedUnavailable } =
   useSnapshotImageOptions(() => value.value);
</script>

<template>
   <StFormItem name="snapshotImageId" label="快照镜像（可选）">
      <template #header-right>
         <StSpace gap="1rem" align="center">
            <StTextButton
               :text="loading ? '刷新中…' : '刷新列表'"
               @click="refresh" />
            <a
               href="/app/publish/image"
               target="_blank"
               class="st-font-caption text-primary hover:underline">
               构建快照镜像 ↗
            </a>
         </StSpace>
      </template>
      <StSpace direction="vertical" gap="0.5rem" fill-x>
         <StSelect
            v-model:value="value"
            placeholder="不使用快照镜像"
            attach-to-body
            :outer-class
            :options="options">
            <template #selected-preview>
               <span class="text-white">{{ selectedName }}</span>
            </template>
         </StSelect>
         <p v-if="selectedUnavailable" class="st-font-caption text-error">
            所选快照镜像不存在或尚未上传完成，保存时会被拒绝。
         </p>
         <p v-else class="st-font-caption text-accent-400">
            打开项目时先把快照镜像挂载到工作区根目录（例如预装好的 node_modules），再执行安装与启动命令。
         </p>
      </StSpace>
   </StFormItem>
</template>
