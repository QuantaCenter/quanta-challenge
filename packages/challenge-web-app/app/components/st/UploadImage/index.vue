<script setup lang="ts">
import { DeleteFour, ImageFiles, LoadingFour } from '@icon-park/vue-next';
import { ref, type DefineComponent } from 'vue';
import { useMessage } from '~/components/st/Message/use-message';
import type { FormItemStatus } from '~/components/st/Form/type';

const props = withDefaults(
   defineProps<{
      placeholder?: string;
      imageMaxHeight?: string;
      icon?: DefineComponent;
      status?: FormItemStatus;
      /** 上传权限级别，默认为 ADMIN */
      uploadLevel?: 'USER' | 'ADMIN';
   }>(),
   {
      uploadLevel: 'ADMIN',
   }
);

const imageUrl = defineModel<string>('imageUrl', { default: '' });
const imageId = defineModel<string>('imageId', { default: '' });
const imageFile = ref<File | null>(null);
const borderClass = computed(() => {
   return props.status === 'error'
      ? '!border !border-error'
      : props.status === 'success'
      ? '!border !border-success'
      : '';
});

const { $trpc } = useNuxtApp();
const message = useMessage();
const uploadImage = async (file: File) => {
   const formData = new FormData();
   formData.append('file', file);

   const res =
      props.uploadLevel === 'USER'
         ? await $trpc.protected.user.uploadImage.mutate(formData)
         : await $trpc.admin.image.upload.mutate(formData);
   imageUrl.value = '/api/static/' + res.name;
   imageId.value = res.id;
};

const uploading = ref(false);
watch(imageFile, async (newFile) => {
   if (!newFile) return;
   if (newFile.size > 5 * 1024 * 1024) {
      message.error('图片上传失败', '图片大小不能超过 5MB');
      imageFile.value = null;
      return;
   }
   uploading.value = true;
   try {
      await atLeastTime(500, uploadImage(newFile));
   } catch (error) {
      imageFile.value = null;
      message.error(
         '图片上传失败',
         error instanceof Error ? error.message : String(error),
      );
   } finally {
      uploading.value = false;
   }
});

const cleanup = () => {
   imageFile.value = null;
   imageUrl.value = '';
   imageId.value = '';
};
</script>

<template>
   <div
      :class="[
         'border border-accent-300 rounded-lg overflow-hidden',
         !imageUrl || uploading ? 'h-[10.6rem]' : 'h-[19rem]',
         borderClass,
         [
            'bg-background',
            !imageUrl && 'hover:bg-accent-600/50 hover:cursor-pointer',
         ],
         'transition-colors',
         'flex items-center justify-center',
      ]">
      <StDropUploader
         v-if="!imageUrl"
         :placeholder="props.placeholder"
         :icon="icon ?? ImageFiles"
         type="file"
         accept="image/*"
         @update:files="imageFile = $event?.[0] || null" />
      <StSpace v-else-if="!uploading" direction="vertical" center gap="0.75rem">
         <img
            :src="imageUrl"
            :style="{ maxHeight: props.imageMaxHeight || '14rem' }"
            class="object-cover rounded-lg"
            alt="Uploaded Image" />
         <div class="relative flex flex-col">
            <div class="st-font-caption text-white">
               {{ imageFile?.name ?? '已上传图片' }}
            </div>
            <StSpace
               @click="cleanup"
               center
               class="text-error size-5 rounded-md hover:bg-error/30 hover:cursor-pointer transition-all absolute -right-7 mt-0.5">
               <DeleteFour size="0.75rem" />
            </StSpace>
         </div>
      </StSpace>
      <StSpace v-else-if="uploading" fill center>
         <LoadingFour class="animate-spin text-primary" />
      </StSpace>
   </div>
</template>
