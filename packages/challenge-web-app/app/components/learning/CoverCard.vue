<script setup lang="ts">
import { NuxtLink } from '#components';
import type { ArticleCoverPreset } from '~/composables/use-learning';
import type {
   FavoriteArticle,
   FavoriteProblem,
} from '~/composables/use-favorites';

/**
 * 封面卡片（课程 / 专题 / 文章共用的外观）。
 *
 * 形态：封面铺满整张卡 → 底部渐隐压住标题 → 左上角一枚必要标签 → 右上角收藏星标；
 * 鼠标悬浮时封面压暗、简介从标题上方淡入（简介最多三行，超出省略）。
 *
 * 三层靠 `variant` 拉开区分度（不做结构上的大改）：课程最大最亮、专题略小并常驻描边、
 * 文章最小且封面压一层浅色（读起来像「内容卡片」而不是「入口卡片」）。
 */
const props = withDefaults(
   defineProps<{
      /** course / topic / article：只影响尺寸、圆角与描边 */
      variant?: 'course' | 'topic' | 'article';
      title: string;
      /** 悬浮时才显示的简介 */
      description?: string;
      preset?: ArticleCoverPreset | null;
      url?: string | null;
      to?: string;
      /** 左上角的必要标签：进度、纯阅读……不传就不显示 */
      badge?: string;
      badgeColor?: string;
      /** 右上角没有收藏时显示的小标注（专题用来标所属课程） */
      cornerLabel?: string;
      favoriteKind?: 'problem' | 'article';
      favoriteTarget?: FavoriteProblem | FavoriteArticle;
      /** 覆盖 variant 里的默认高度 */
      height?: string;
      /** 同一栏里标出「当前所在的这一个」 */
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
      favoriteKind: undefined,
      favoriteTarget: undefined,
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
            v-if="cornerLabel && !(favoriteKind && favoriteTarget)"
            size="small"
            color="#434343"
            :content="cornerLabel"
            class="absolute right-3 top-3" />

         <LearningFavoriteButton
            v-if="favoriteKind && favoriteTarget"
            :kind="favoriteKind"
            :target="favoriteTarget"
            raised
            class="absolute right-3 top-3 z-10" />

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
