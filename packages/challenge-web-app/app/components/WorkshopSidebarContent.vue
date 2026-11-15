<script setup lang="ts">
import { Download, SettingOne, Upload } from '@icon-park/vue-next';
import { useEventEmitter } from '~/composables/use-event-emitter';
import useAuthStore from '~/stores/auth-store';

/** 工坊侧边栏：上传 / 下载、布局开关、项目设置与头像。 */

const isMobile = useIsMobile();
const store = useEditorStore();

const { emit: emitUpload } = useEventEmitter<{ at: number }>('workshop', 'upload');
const { emit: emitDownload } = useEventEmitter<{ at: number }>('workshop', 'download');
const { emit: emitSettings } = useEventEmitter<{ at: number }>('workshop', 'settings');

const authStore = useAuthStore();
const avatarUrl = computed(() => {
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId ? `/api/static/${user.imageId}` : '';
});
</script>

<template>
   <StMiniSidebarDivider />

   <EditorSidebarTools section="panels" />

   <StMiniSidebarDivider />

   <StSpace direction="vertical" align="center" gap="0.5rem">
      <EditorSidebarTools section="search" />

      <StMiniSidebarButton
         name="上传文件"
         aria-label="上传文件"
         class="!text-success"
         @click="emitUpload({ at: Date.now() })">
         <Upload class="text-[1.1rem]" />
      </StMiniSidebarButton>

      <StMiniSidebarButton
         name="下载项目（zip）"
         aria-label="下载项目"
         @click="emitDownload({ at: Date.now() })">
         <Download class="text-[1.1rem]" />
      </StMiniSidebarButton>

      <ChallengeLayoutMenu v-if="!isMobile" />
   </StSpace>

   <div class="flex-1" />

   <StSpace direction="vertical" align="center" gap="0.5rem" class="mb-1">
      <StMiniSidebarButton
         name="项目设置"
         aria-label="项目设置"
         @click="emitSettings({ at: Date.now() })">
         <SettingOne class="text-[1.1rem]" />
      </StMiniSidebarButton>
      <StAvatar size="2.25rem" :url="avatarUrl" />
   </StSpace>
</template>
