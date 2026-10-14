<script setup lang="ts">
import { Check, Edit } from '@icon-park/vue-next';
import {
   ARTICLE_COVER_PRESETS,
   type ArticleCoverPreset,
} from '~/composables/use-learning';
import type { ISlideRadioGroupOption } from '~/components/st/SlideRadioGroup/type';

/**
 * 文章封面：详情页同款的整幅封面，右下角「编辑封面」按钮弹出 drawer，
 * 在 drawer 里切换预设渐变或上传自定义图片，改动实时反映到封面上。
 */
const mode = defineModel<'preset' | 'custom'>('mode', { default: 'preset' });
const preset = defineModel<ArticleCoverPreset>('preset', { default: 'slate' });
const url = defineModel<string>('url', { default: '' });
const imageId = defineModel<string>('imageId', { default: '' });

const drawerOpened = ref(false);

const modeOptions: ISlideRadioGroupOption[] = [
   { label: '使用预设封面', value: 'preset', color: '#FA7C0E' },
   { label: '上传自定义封面', value: 'custom', color: '#FA7C0E' },
];

const previewUrl = computed(() => (mode.value === 'custom' ? url.value : ''));
</script>

<template>
   <div class="w-full overflow-hidden rounded-[0.5rem]">
      <LearningArticleCover
         :preset="preset"
         :url="previewUrl"
         height="20rem"
         icon-size="6rem">
         <button
            type="button"
            class="absolute bottom-4 right-4 flex cursor-pointer items-center gap-1.5 rounded-[0.375rem] bg-black/50 px-3 py-1.5 st-font-body-normal text-white backdrop-blur-sm transition-opacity hover:opacity-75"
            @click="drawerOpened = true">
            <Edit size="1rem" :strokeWidth="3" />
            <span>编辑封面</span>
         </button>
      </LearningArticleCover>
   </div>

   <StDrawer global v-model:opened="drawerOpened" width="35rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace
            direction="vertical"
            gap="1.5rem"
            fill
            class="overflow-auto p-6">
            <h1 class="st-font-secondary-bold">编辑封面</h1>

            <StSlideRadioGroup
               v-model:value="mode"
               :options="modeOptions"
               class="w-full" />

            <template v-if="mode === 'preset'">
               <StSpace gap="0.75rem" align="center" fill-x class="flex-wrap">
                  <button
                     v-for="item in ARTICLE_COVER_PRESETS"
                     :key="item.id"
                     type="button"
                     :title="`使用「${item.name}」封面`"
                     :aria-label="`使用「${item.name}」封面`"
                     class="relative size-[4.25rem] cursor-pointer rounded-[0.75rem] border-2 bg-gradient-to-br transition-all"
                     :class="[
                        item.class,
                        preset === item.id
                           ? 'border-secondary'
                           : 'border-transparent hover:border-accent-300',
                     ]"
                     @click="preset = item.id">
                     <Check
                        v-if="preset === item.id"
                        class="absolute right-1 top-1 text-secondary"
                        size="0.875rem"
                        :strokeWidth="4" />
                  </button>
               </StSpace>
            </template>

            <template v-else>
               <StUploadImage
                  v-model:image-url="url"
                  v-model:image-id="imageId"
                  class="w-full"
                  placeholder="上传一张横版封面（建议 16:9）" />
            </template>
         </StSpace>

         <StSpace justify="end" class="w-full p-4 pt-0">
            <StButton
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]"
               @click="drawerOpened = false">
               <span>完成</span>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
