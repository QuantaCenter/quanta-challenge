<script setup lang="ts">
import { NuxtLink } from '#components';
import type { ArticleCoverPreset } from '~/composables/use-learning';

/**
 * 封面卡片，课程 / 专题 / 文章共用的外观。
 */
const props = withDefaults(
   defineProps<{
      /** course / topic / article，只影响尺寸与描边 */
      variant?: 'course' | 'topic' | 'article';
      title: string;
      /** 悬浮时才显示的简介 */
      description?: string;
      preset?: ArticleCoverPreset | null;
      url?: string | null;
      to?: string;
      /** 左上角标签，不传不显示 */
      badge?: string;
      badgeColor?: string;
      /** 右上角小标注 */
      cornerLabel?: string;
      /** 覆盖默认高度 */
      height?: string;
      /** 标出当前所在的这一个 */
      selected?: boolean;
   }>(),
   {
      variant: 'article',
      description: '',
      preset: null,
      url: null,
      to: undefined,
      badge: undefined,
      badgeColor: '#434343',
      cornerLabel: undefined,
      height: undefined,
      selected: false,
   },
);

const VARIANT_STYLE = {
   course: {
      height: '14rem',
      titleSize: '1.5rem',
      radius: 'rounded-[1rem]',
      border: 'border-transparent hover:border-secondary/50',
      scrim: '',
      padding: 'p-4',
   },
   topic: {
      height: '12.5rem',
      titleSize: '1.15rem',
      radius: 'rounded-[1rem]',
      border: 'border-accent-500 hover:border-secondary',
      scrim: '',
      padding: 'p-4',
   },
   article: {
      height: '10.5rem',
      titleSize: '1rem',
      radius: 'rounded-[0.75rem]',
      border: 'border-transparent hover:border-secondary/50',
      scrim: 'bg-background/25',
      padding: 'p-3',
   },
} as const;

const style = computed(() => VARIANT_STYLE[props.variant]);
const boxHeight = computed(() => props.height ?? style.value.height);

const wrapper = computed(() => (props.to ? NuxtLink : 'div'));
</script>

<template>
   <component :is="wrapper" :to="to" class="block w-full">
      <div
         class="group relative w-full overflow-hidden border transition-all"
         :class="[
            style.radius,
            selected ? 'border-secondary' : style.border,
         ]"
         :style="{ height: boxHeight }">
         <LearningArticleCover
            :preset="preset"
            :url="url"
            height="100%"
            icon-size="5rem" />

         <!-- 文章卡片常驻一层浅色：封面不抢戏，和专题/课程的「入口感」区分开 -->
         <div v-if="style.scrim" class="absolute inset-0" :class="style.scrim" />

         <!-- 悬浮压暗 -->
         <div
            class="absolute inset-0 bg-background/65 opacity-0 group-hover:opacity-100 transition-opacity" />

         <!-- 底部渐隐：标题压在上面也读得清 -->
         <div
            class="absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-background via-background/75 to-transparent" />

         <div v-if="badge" class="absolute left-3 top-3">
            <StTag size="small" :color="badgeColor" :content="badge" />
         </div>

         <StTag
            v-if="cornerLabel"
            size="small"
            color="#434343"
            :content="cornerLabel"
            class="absolute right-3 top-3" />

         <div
            class="absolute inset-x-0 bottom-0 flex flex-col gap-2"
            :class="style.padding">
            <!-- 简介先于标题出现，展开时标题被往上顶，卡片本身不跳 -->
            <p
               v-if="description"
               class="st-font-tooltip text-accent-200 line-clamp-3 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
               {{ description }}
            </p>
            <span
               class="font-bold text-white line-clamp-2"
               :style="{ fontSize: style.titleSize }">
               {{ title }}
            </span>
         </div>
      </div>
   </component>
</template>
