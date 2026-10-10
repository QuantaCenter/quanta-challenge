<script setup lang="ts">
import { Check } from '@icon-park/vue-next';
import {
   ARTICLE_COVER_PRESETS,
   type ArticleCoverPreset,
} from '~/composables/use-learning';
import type { ISlideRadioGroupOption } from '~/components/st/SlideRadioGroup/type';

/**
 * 文章封面：预设渐变 + 上传自定义图片。
 * 形态照 `publish/problem` 的封面字段（`StSlideRadioGroup` 选模式 + `StUploadImage` 上传）。
 */
const mode = defineModel<'preset' | 'custom'>('mode', { default: 'preset' });
const preset = defineModel<ArticleCoverPreset>('preset', { default: 'slate' });
const url = defineModel<string>('url', { default: '' });
const imageId = defineModel<string>('imageId', { default: '' });

const modeOptions: ISlideRadioGroupOption[] = [
   { label: '使用预设封面', value: 'preset', color: '#FA7C0E' },
   { label: '上传自定义封面', value: 'custom', color: '#FA7C0E' },
];

const previewUrl = computed(() => (mode.value === 'custom' ? url.value : ''));
</script>

<template>
   <!-- 用普通 flex 列而不是 StSpace：StSpace 默认 items-start，
       会让 StSlideRadioGroup 收缩成内容宽度，两个选项就会各自折行 -->
   <div class="w-full flex flex-col gap-3">
      <StSlideRadioGroup v-model:value="mode" :options="modeOptions" />

      <template v-if="mode === 'preset'">
         <StSpace gap="0.75rem" align="center" class="flex-wrap">
            <button
               v-for="item in ARTICLE_COVER_PRESETS"
               :key="item.id"
               type="button"
               :title="`使用「${item.name}」封面`"
               :aria-label="`使用「${item.name}」封面`"
               class="relative size-[4.25rem] rounded-[0.75rem] bg-gradient-to-br border-2 transition-all cursor-pointer"
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
            placeholder="上传一张横版封面（建议 16:9）" />
      </template>

      <StSpace align="center" gap="0.75rem" fill-x>
         <LearningArticleCover
            :preset="preset"
            :url="previewUrl"
            height="5.5rem"
            icon-size="2.5rem"
            class="w-[9.5rem] shrink-0 rounded-[0.75rem] overflow-hidden" />
      </StSpace>
   </div>
</template>
